from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import numpy as np
import logging
import os
import sys
import time
import threading
import requests
import uuid
import re
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownTextSplitter
import json
import psutil
import gc
import threading
import requests
from status_reporter import StatusReporter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Enable CORS for all routes
CORS(app, origins=['http://localhost:3000', 'http://localhost:3210', 'http://localhost:3211'])

# Add request logging middleware
@app.before_request
def log_request_info():
    try:
        logger.info(f"Incoming request: {request.method} {request.path}")
        logger.info(f"Request headers: {dict(request.headers)}")
        logger.info(f"Content-Type: {request.content_type}")
        if request.content_type == 'application/json':
            try:
                data = request.get_json(force=True)
                logger.info(f"Request JSON: {data}")
            except Exception as e:
                logger.info(f"Failed to parse JSON: {e}")
                logger.info(f"Raw data: {request.get_data()}")
        else:
            logger.info(f"Request data: {request.get_data()}")
    except Exception as e:
        logger.error(f"Error in request logging: {e}")

@app.after_request
def log_response_info(response):
    try:
        logger.info(f"Response status: {response.status_code}")
    except Exception as e:
        logger.error(f"Error in response logging: {e}")
    return response

# Global variables to store the model and loading status
model = None
model_loaded = False
model_loading = False
model_error = None
start_time = time.time()
load_start_time = None

# Status reporter configuration
CONVEX_URL = os.environ.get('CONVEX_URL', 'http://localhost:3000')
SERVICE_NAME = 'vector-convert-llm'
status_reporter = None

# Log environment configuration for debugging
logger.info(f"🔧 Environment Configuration:")
logger.info(f"   CONVEX_URL: {CONVEX_URL}")
logger.info(f"   SERVICE_NAME: {SERVICE_NAME}")
logger.info(f"   PORT: {os.environ.get('PORT', '7999')}")
logger.info(f"   Python version: {sys.version}")
logger.info(f"   Working directory: {os.getcwd()}")

# Conversion job functions removed as part of tech debt cleanup
# These functions were previously used to track LLM/embedding conversion history
# but are no longer needed as the conversion_jobs table has been removed

def load_model():
    """Load the sentence transformer model with retry logic and fallback"""
    global model, model_loaded, model_loading, model_error, load_start_time, status_reporter
    import time
    import os
    
    try:
        model_loading = True
        model_error = None
        load_start_time = time.time()
        logger.info("Loading minimal sentence-transformers model: all-MiniLM-L6-v2")
        
        # Send loading status
        if status_reporter:
            status_reporter.send_loading_status("Loading sentence transformer model: all-MiniLM-L6-v2")
        
        # Import here to avoid startup issues
        from sentence_transformers import SentenceTransformer
        
        # Try multiple approaches to load the model
        model_names = [
            'all-MiniLM-L6-v2',
            'paraphrase-MiniLM-L6-v2'
        ]
        
        for attempt, model_name in enumerate(model_names, 1):
            try:
                logger.info(f"Attempt {attempt}: Loading model '{model_name}'")
                
                # Set environment variables for better connectivity
                os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
                os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
                
                # Try loading with different configurations
                if attempt == 1:
                    # First attempt: normal loading
                    model = SentenceTransformer(model_name, cache_folder='/app/cache/transformers')
                elif attempt == 2:
                    # Second attempt: with explicit cache and trust_remote_code
                    model = SentenceTransformer(
                        model_name, 
                        cache_folder='/app/cache/transformers',
                        trust_remote_code=True
                    )
                else:
                    # Third attempt: fallback model
                    model = SentenceTransformer(model_name)
                
                model_loaded = True
                model_loading = False
                logger.info(f"Model '{model_name}' loaded successfully on attempt {attempt}")
                
                # Send healthy status
                if status_reporter:
                    status_reporter.send_healthy_status(model_name)
                
                return
                
            except Exception as e:
                logger.warning(f"Attempt {attempt} failed for model '{model_name}': {e}")
                if attempt < len(model_names):
                    logger.info(f"Retrying with next model...")
                    time.sleep(2)  # Wait before retry
                else:
                    raise e
                    
    except Exception as e:
        model_loading = False
        model_error = str(e)
        logger.error(f"All model loading attempts failed: {e}")
        
        # Send error status
        if status_reporter:
            status_reporter.send_error_status(f"Model loading failed: {str(e)}")
        
        # Set a flag to indicate we're running without a model
        model = None
        model_loaded = False
        logger.warning("Service will run in degraded mode without embedding model")
        
        # Don't raise the exception - let the service continue without the model
        # raise e

def load_model_async():
    """Load model in background thread"""
    try:
        load_model()
    except Exception as e:
        logger.error(f"Background model loading failed: {e}")

def chunk_document(content: str, content_type: str = "text", chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """Chunk document content using improved semantic splitting"""
    try:
        # First, try semantic chunking for structured content
        semantic_chunks = semantic_chunk_document(content, chunk_size)
        if semantic_chunks and len(semantic_chunks) > 1:
            logger.info(f"Document semantically chunked into {len(semantic_chunks)} pieces")
            return semantic_chunks
        
        # Fallback to LangChain splitters
        if content_type.lower() == "markdown":
            # Use MarkdownTextSplitter for markdown content
            text_splitter = MarkdownTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
            )
        else:
            # Use RecursiveCharacterTextSplitter with better separators for structured content
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                length_function=len,
                separators=[
                    "\n\n\n",  # Multiple line breaks
                    "\n\n",    # Double line breaks
                    "\n",      # Single line breaks
                    ". ",      # Sentence endings
                    ", ",      # Comma separations
                    " ",       # Spaces
                    ""
                ]
            )
        
        chunks = text_splitter.split_text(content)
        logger.info(f"Document chunked into {len(chunks)} pieces (chunk_size={chunk_size}, overlap={chunk_overlap})")
        return chunks
        
    except Exception as e:
        logger.error(f"Error chunking document: {e}")
        # Fallback to simple chunking if LangChain fails
        return simple_chunk_text(content, chunk_size)

def semantic_chunk_document(content: str, max_chunk_size: int = 1000) -> List[str]:
    """Semantic chunking that preserves numbered lists and structured content"""
    try:
        lines = content.split('\n')
        chunks = []
        current_chunk = []
        current_size = 0
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Check if this line starts a numbered list or structured section
            if is_section_start(line):
                # Save current chunk if it exists
                if current_chunk and current_size > 100:  # Only save substantial chunks
                    chunks.append('\n'.join(current_chunk).strip())
                    current_chunk = []
                    current_size = 0
                
                # Collect the entire section/numbered item with its sub-items
                section_lines = collect_section(lines, i)
                section_text = '\n'.join(section_lines).strip()
                
                # If section is too large, split it but keep related content together
                if len(section_text) > max_chunk_size:
                    # Try to split at sub-items while keeping main item intact
                    sub_chunks = split_large_section(section_text, max_chunk_size)
                    chunks.extend(sub_chunks)
                else:
                    # Add section as a single chunk
                    if section_text:
                        chunks.append(section_text)
                
                # Skip the lines we just processed
                i += len(section_lines)
                continue
            
            # Regular line processing
            line_with_newline = lines[i]
            if current_size + len(line_with_newline) > max_chunk_size and current_chunk:
                # Save current chunk and start new one
                chunks.append('\n'.join(current_chunk).strip())
                current_chunk = [line_with_newline]
                current_size = len(line_with_newline)
            else:
                current_chunk.append(line_with_newline)
                current_size += len(line_with_newline) + 1  # +1 for newline
            
            i += 1
        
        # Add final chunk
        if current_chunk:
            final_chunk = '\n'.join(current_chunk).strip()
            if final_chunk:
                chunks.append(final_chunk)
        
        # Filter out very small chunks and merge them with adjacent ones
        filtered_chunks = []
        for chunk in chunks:
            if len(chunk.strip()) < 50 and filtered_chunks:
                # Merge small chunk with previous one
                filtered_chunks[-1] += '\n\n' + chunk
            elif len(chunk.strip()) >= 50:
                filtered_chunks.append(chunk)
        
        return filtered_chunks if len(filtered_chunks) > 1 else []
        
    except Exception as e:
        logger.error(f"Error in semantic chunking: {e}")
        return []

def is_section_start(line: str) -> bool:
    """Check if line starts a new section (numbered item, header, etc.)"""
    line = line.strip()
    if not line:
        return False
    
    # Numbered lists (1., 2., etc.)
    if re.match(r'^\d+\.\s', line):
        return True
    
    # Lettered lists (a., b., etc.)
    if re.match(r'^[a-zA-Z]\.\s', line):
        return True
    
    # Bullet points
    if re.match(r'^[-*•]\s', line):
        return True
    
    # Headers (markdown style)
    if line.startswith('#'):
        return True
    
    # Step indicators
    if re.match(r'^(step|phase|stage)\s*\d+', line.lower()):
        return True
    
    return False

def collect_section(lines: List[str], start_idx: int) -> List[str]:
    """Collect all lines belonging to a section starting at start_idx"""
    section_lines = [lines[start_idx]]
    i = start_idx + 1
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Empty line - include it but check next line
        if not line:
            section_lines.append(lines[i])
            i += 1
            continue
        
        # If we hit another section start, stop
        if is_section_start(line):
            break
        
        # Include lines that seem to be part of this section
        # (indented content, continuation, sub-items)
        if (lines[i].startswith('  ') or  # Indented
            lines[i].startswith('\t') or  # Tabbed
            re.match(r'^\s*[a-zA-Z]\.|^\s*[-*•]', line) or  # Sub-items
            not re.match(r'^\d+\.', line)):  # Not a new numbered item
            section_lines.append(lines[i])
        else:
            break
        
        i += 1
    
    return section_lines

def split_large_section(section_text: str, max_size: int) -> List[str]:
    """Split a large section while trying to preserve semantic meaning"""
    # Try to split at natural boundaries within the section
    lines = section_text.split('\n')
    chunks = []
    current_chunk = []
    current_size = 0
    
    for line in lines:
        if current_size + len(line) > max_size and current_chunk:
            chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_size = len(line)
        else:
            current_chunk.append(line)
            current_size += len(line) + 1
    
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    
    return chunks

def simple_chunk_text(text: str, max_chunk_size: int = 1000) -> List[str]:
    """Simple fallback chunking method"""
    if len(text) <= max_chunk_size:
        return [text]
    
    chunks = []
    for i in range(0, len(text), max_chunk_size):
        chunks.append(text[i:i + max_chunk_size])
    
    return chunks

@app.route('/routes', methods=['GET'])
def list_routes():
    """List all available routes for debugging"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods),
            'rule': str(rule)
        })
    return jsonify({'routes': routes}), 200

def get_memory_usage():
    """Get current memory usage information"""
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_percent = process.memory_percent()
        cpu_percent = process.cpu_percent(interval=0.1)  # Get CPU usage
        
        # Get system memory info
        system_memory = psutil.virtual_memory()
        
        return {
            'process_memory_mb': round(memory_info.rss / 1024 / 1024, 2),
            'process_memory_percent': round(memory_percent, 2),
            'process_cpu_percent': round(cpu_percent, 2),
            'system_memory_total_gb': round(system_memory.total / 1024 / 1024 / 1024, 2),
            'system_memory_available_gb': round(system_memory.available / 1024 / 1024 / 1024, 2),
            'system_memory_used_percent': round(system_memory.percent, 2)
        }
    except Exception as e:
        logger.error(f"Error getting memory usage: {e}")
        return {
            'process_memory_mb': 0,
            'process_memory_percent': 0,
            'process_cpu_percent': 0,
            'system_memory_total_gb': 0,
            'system_memory_available_gb': 0,
            'system_memory_used_percent': 0,
            'error': str(e)
        }

# Memory monitoring removed - now handled by consolidated metrics endpoint

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with detailed status and memory usage"""
    global model_loaded, model_loading, model_error, start_time, load_start_time, status_reporter
    
    current_time = time.time()
    uptime = current_time - start_time
    
    # Get memory usage
    memory_usage = get_memory_usage()
    
    # Determine service status
    if model_error:
        # Service is still healthy even if model failed to load (degraded mode)
        status = 'degraded'
        ready = True  # Service can still respond to requests
        message = f"Service running in degraded mode - Model loading failed: {model_error[:100]}{'...' if len(str(model_error)) > 100 else ''}"
    elif model_loading:
        status = 'loading'
        ready = False
        if load_start_time:
            load_duration = current_time - load_start_time
            message = f"Vector converter app model downloading/loading... ({load_duration:.1f}s elapsed)"
        else:
            message = "Vector converter model downloading/loading..."
    elif model_loaded:
        status = 'healthy'
        ready = True
        message = "Vector converter app ready for inference"
    else:
        status = 'starting'
        ready = False
        message = "Vector converter app starting, model not yet loaded"
    
    # Send periodic status updates to Convex
    if status_reporter:
        try:
            if model_error:
                status_reporter.send_degraded_status(f"Service running in degraded mode: {model_error[:100]}")
            elif model_loaded:
                status_reporter.send_healthy_status('all-MiniLM-L6-v2')
            elif model_loading:
                status_reporter.send_loading_status("Loading sentence transformer model")
            else:
                status_reporter.send_startup_status()
        except Exception as e:
            logger.error(f"Error sending status update: {e}")
    
    return jsonify({
        'status': status,
        'ready': ready,
        'message': message,
        'model_loaded': model_loaded,
        'model_loading': model_loading,
        'model': 'all-MiniLM-L6-v2' if model_loaded else None,
        'service': 'vector-convert-llm',
        'uptime': uptime,
        'error': model_error,
        'memory_usage': memory_usage,
        'degraded_mode': model_error is not None
    }), 200

@app.route('/test-post', methods=['POST'])
def test_post():
    """Simple test endpoint for POST requests"""
    logger.info("Received POST request to /test-post")
    try:
        data = request.get_json()
        logger.info(f"Request data: {data}")
        return jsonify({
            'status': 'success',
            'message': 'POST request received successfully',
            'received_data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in test_post: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/encode', methods=['POST'])
def encode_sentences():
    """
    Simple API endpoint to encode a list of sentences into embeddings.
    Expects a JSON payload with a 'sentences' key containing a list of strings.
    This matches the example you provided.
    """
    logger.info("=== ENCODE ENDPOINT START ===")
    logger.info("Received POST request to /encode")
    
    try:
        # Check if model is loaded
        if model is None or not model_loaded:
            logger.error("Model not loaded - service running in degraded mode")
            return jsonify({
                "error": "Model not available - service running in degraded mode",
                "degraded_mode": True,
                "model_error": model_error
            }), 503
        
        # Parse JSON data
        data = request.get_json()
        logger.info(f"Received data: {data}")
        
        if not data or 'sentences' not in data or not isinstance(data['sentences'], list):
            logger.error("Invalid input format")
            return jsonify({"error": "Invalid input. Please provide a JSON object with a 'sentences' key containing a list of strings."}), 400

        sentences = data['sentences']
        logger.info(f"Processing {len(sentences)} sentences")
        
        try:
            embeddings = model.encode(sentences).tolist()  # Convert numpy array to list for JSON serialization
            logger.info(f"Successfully generated embeddings with shape: {len(embeddings)}x{len(embeddings[0]) if embeddings else 0}")
            
            response = {"embeddings": embeddings}
            logger.info("=== ENCODE ENDPOINT SUCCESS ===")
            return jsonify(response), 200
            
        except Exception as e:
            logger.error(f"Error during encoding: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
            
    except Exception as e:
        logger.error(f"CRITICAL ERROR in encode_sentences: {e}", exc_info=True)
        logger.error("=== ENCODE ENDPOINT FAILED ===")
        return jsonify({"error": str(e)}), 500

@app.route('/embed', methods=['POST'])
def embed_text():
    """Embed text using the sentence transformer model with enhanced preprocessing"""
    start_time_local = time.time()
    
    try:
        logger.info("=== EMBED ENDPOINT START ===")
        logger.info("Received POST request to /embed")
        
        # Check model status
        if model is None:
            logger.error("Model is None - service running in degraded mode")
            return jsonify({
                'error': 'Model not available - service running in degraded mode',
                'degraded_mode': True,
                'model_error': model_error
            }), 503
        
        if not model_loaded:
            logger.error(f"Model not ready - loaded: {model_loaded}, loading: {model_loading}")
            return jsonify({
                'error': 'Model not ready - still loading or failed to load',
                'degraded_mode': model_error is not None,
                'model_error': model_error
            }), 503
        
        # Parse request data
        try:
            data = request.get_json(force=True)
            logger.info(f"Successfully parsed JSON with keys: {list(data.keys()) if data else 'None'}")
        except Exception as json_error:
            logger.error(f"Failed to parse JSON: {json_error}")
            return jsonify({'error': f'Invalid JSON: {str(json_error)}'}), 400
        
        if not data or 'text' not in data:
            logger.error(f"Missing text field in request")
            return jsonify({'error': 'Missing text field in request'}), 400
        
        text = data['text']
        logger.info(f"Processing text (length: {len(str(text))})")
        
        # Validate and preprocess text input
        if isinstance(text, str):
            texts = [text.strip()]
            logger.info("Processing single string")
        elif isinstance(text, list):
            texts = [str(t).strip() for t in text if str(t).strip()]
            logger.info(f"Processing list of {len(texts)} strings")
        else:
            logger.error(f"Invalid text type: {type(text)}")
            return jsonify({'error': 'Text must be string or list of strings'}), 400
        
        # Filter out empty texts
        texts = [t for t in texts if t]
        if not texts:
            logger.error("No valid text content to embed")
            return jsonify({'error': 'No valid text content provided'}), 400
        
        # Enhanced text preprocessing for better embeddings
        processed_texts = []
        for text_item in texts:
            # Clean and normalize text
            cleaned_text = text_item.strip()
            
            # Remove excessive whitespace
            cleaned_text = ' '.join(cleaned_text.split())
            
            # Ensure minimum length for meaningful embeddings
            if len(cleaned_text) < 3:
                cleaned_text = f"Short text: {cleaned_text}"
            
            processed_texts.append(cleaned_text)
        
        logger.info(f"Preprocessed {len(processed_texts)} texts for embedding")
        
        # Generate embeddings with error handling
        try:
            logger.info("Starting embedding generation...")
            
            # Use batch processing for efficiency
            embeddings = model.encode(
                processed_texts,
                batch_size=min(32, len(processed_texts)),  # Reasonable batch size
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True  # Normalize for better similarity search
            )
            
            logger.info(f"Embeddings generated successfully. Shape: {embeddings.shape}")
            
        except Exception as embed_error:
            logger.error(f"Error during embedding generation: {embed_error}", exc_info=True)
            return jsonify({'error': f'Embedding generation failed: {str(embed_error)}'}), 500
        
        # Convert to list for JSON serialization
        try:
            if isinstance(text, str):
                # Single text input, return single embedding
                result = embeddings[0].tolist()
                logger.info(f"Single embedding converted, dimension: {len(result)}")
            else:
                # Multiple texts, return list of embeddings
                result = [emb.tolist() for emb in embeddings]
                logger.info(f"Multiple embeddings converted, count: {len(result)}")
        except Exception as convert_error:
            logger.error(f"Error converting embeddings to list: {convert_error}", exc_info=True)
            return jsonify({'error': f'Result conversion failed: {str(convert_error)}'}), 500
        
        processing_time = int((time.time() - start_time_local) * 1000)
        logger.info(f"Processing completed successfully in {processing_time}ms")
        
        response_data = {
            'embeddings': result,
            'dimension': len(embeddings[0]),
            'model': 'all-MiniLM-L6-v2',
            'processing_time_ms': processing_time,
            'texts_processed': len(processed_texts)
        }
        
        logger.info("=== EMBED ENDPOINT SUCCESS ===")
        return jsonify(response_data), 200
        
    except Exception as e:
        processing_time = int((time.time() - start_time_local) * 1000)
        logger.error(f"CRITICAL ERROR in embed_text: {e}", exc_info=True)
        logger.error("=== EMBED ENDPOINT FAILED ===")
        
        try:
            error_response = {
                'error': str(e),
                'error_type': type(e).__name__,
                'processing_time_ms': processing_time
            }
            return jsonify(error_response), 500
        except Exception as response_error:
            logger.error(f"Failed to create error response: {response_error}")
            return f"Internal server error: {str(e)}", 500

@app.route('/similarity', methods=['POST'])
def calculate_similarity():
    """Calculate similarity between texts"""
    start_time = time.time()
    job_id = None
    
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'texts' not in data:
            return jsonify({'error': 'Missing texts field in request'}), 400
        
        texts = data['texts']
        if not isinstance(texts, list) or len(texts) < 2:
            return jsonify({'error': 'texts must be a list with at least 2 items'}), 400
        
        # Create conversion job
        job_id = create_conversion_job(
            job_type="similarity",
            input_text=str(texts[:100]) if texts else None,  # Truncate for storage
            request_source="api"
        )
        
        if job_id:
            update_conversion_job(job_id, "processing")
        
        # Generate embeddings
        embeddings = model.encode(texts)
        
        # Calculate similarity matrix
        similarities = model.similarity(embeddings, embeddings)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Update job as completed
        if job_id:
            output_data = {
                "text_count": len(texts),
                "model": "all-MiniLM-L6-v2",
                "similarity_matrix_size": f"{len(texts)}x{len(texts)}"
            }
            update_conversion_job(job_id, "completed", output_data=output_data, processing_time_ms=processing_time)
        
        return jsonify({
            'similarities': similarities.tolist(),
            'texts': texts,
            'model': 'all-MiniLM-L6-v2'
        }), 200
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        
        # Update job as failed
        if job_id:
            update_conversion_job(job_id, "failed", error_message=str(e), processing_time_ms=processing_time)
        
        logger.error(f"Error in calculate_similarity: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/search', methods=['POST'])
def semantic_search():
    """Perform semantic search"""
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'query' not in data or 'documents' not in data:
            return jsonify({'error': 'Missing query or documents field in request'}), 400
        
        query = data['query']
        documents = data['documents']
        top_k = data.get('top_k', 5)
        
        if not isinstance(documents, list):
            return jsonify({'error': 'documents must be a list'}), 400
        
        # Generate embeddings
        query_embedding = model.encode([query])
        doc_embeddings = model.encode(documents)
        
        # Calculate similarities
        similarities = model.similarity(query_embedding, doc_embeddings)[0]
        
        # Get top-k results
        top_indices = np.argsort(similarities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            results.append({
                'document': documents[idx],
                'score': float(similarities[idx]),
                'index': int(idx)
            })
        
        return jsonify({
            'query': query,
            'results': results,
            'model': 'all-MiniLM-L6-v2'
        }), 200
        
    except Exception as e:
        logger.error(f"Error in semantic_search: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/process-document', methods=['POST'])
def process_document_embedding():
    """Fetch document from Convex, generate embedding with chunking, and save back to Convex"""
    start_time = time.time()
    job_id = None
    
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'document_id' not in data:
            return jsonify({'error': 'Missing document_id field in request'}), 400
        
        document_id = data['document_id']
        # Always use the internal Docker network URL for Convex
        convex_url = os.environ.get('CONVEX_URL', 'http://convex-backend:3211')
        use_chunking = data.get('use_chunking', True)  # Enable chunking by default
        chunk_size = data.get('chunk_size', 1000)
        chunk_overlap = data.get('chunk_overlap', 200)
        
        if not convex_url:
            return jsonify({'error': 'Convex URL not provided'}), 400
        
        logger.info(f"Processing document embedding for ID: {document_id} (chunking: {use_chunking})")
        logger.info(f"Convex URL used: {convex_url}")
        
        # Create conversion job
        job_id = create_conversion_job(
            job_type="document_embedding",
            document_id=document_id,
            request_source="web_app"
        )
        
        if job_id:
            update_conversion_job(job_id, "processing")
        
        # Fetch document from Convex
        logger.info(f"Fetching document from Convex: {document_id}")
        fetch_url = f"{convex_url}/api/documents/{document_id}"
        logger.info(f"Fetching document from Convex at: {fetch_url}")
        fetch_response = requests.get(fetch_url)
        
        if fetch_response.status_code != 200:
            error_msg = f"Failed to fetch document from Convex: {fetch_response.status_code} - {fetch_response.text}"
            logger.error(error_msg)
            if job_id:
                update_conversion_job(job_id, "failed", error_message=error_msg)
            return jsonify({
                'error': 'Failed to fetch document from Convex',
                'convex_status': fetch_response.status_code,
                'convex_error': fetch_response.text
            }), 500
        
        document_data = fetch_response.json()
        text = document_data.get('content')
        content_type = document_data.get('contentType', 'text')
        document_title = document_data.get('title', 'Unknown Document')
        
        if not text:
            error_msg = "Document content is empty or missing"
            logger.error(error_msg)
            if job_id:
                update_conversion_job(job_id, "failed", error_message=error_msg)
            return jsonify({'error': error_msg}), 400
        
        logger.info(f"Document fetched successfully, content length: {len(text)}, type: {content_type}")
        
        # Generate embedding with chunking
        if use_chunking and len(text) > chunk_size:
            logger.info("‼️Using chunking for large document🤖...")
            
            # Chunk the document
            chunks = chunk_document(text, content_type, chunk_size, chunk_overlap)
            
            # Generate embeddings for each chunk with memory management
            logger.info(f"Generating embeddings for {len(chunks)} chunks...")
            chunk_embeddings = []
            
            # Process chunks in smaller batches to prevent memory issues
            batch_size = 2  # Process 2 chunks at a time to reduce memory pressure
            
            for batch_start in range(0, len(chunks), batch_size):
                batch_end = min(batch_start + batch_size, len(chunks))
                batch_chunks = chunks[batch_start:batch_end]
                
                try:
                    # Process batch of chunks
                    logger.info(f"Processing batch {batch_start//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size} (chunks {batch_start+1}-{batch_end})")
                    
                    # Generate embeddings for the batch
                    batch_embeddings = model.encode(batch_chunks, show_progress_bar=False)
                    
                    # Add each embedding to the list
                    for i, embedding in enumerate(batch_embeddings):
                        chunk_embeddings.append(embedding.tolist())
                        logger.info(f"Generated embedding for chunk {batch_start + i + 1}/{len(chunks)}")
                    
                    # Force garbage collection after each batch
                    import gc
                    gc.collect()
                    
                except Exception as batch_error:
                    logger.error(f"Error processing batch {batch_start//batch_size + 1}: {batch_error}")
                    
                    # Fallback: try processing chunks individually in this batch
                    for i, chunk in enumerate(batch_chunks):
                        try:
                            chunk_embedding = model.encode([chunk], show_progress_bar=False)[0].tolist()
                            chunk_embeddings.append(chunk_embedding)
                            logger.info(f"Generated embedding for chunk {batch_start + i + 1}/{len(chunks)} (individual fallback)")
                        except Exception as chunk_error:
                            logger.error(f"Error generating embedding for chunk {batch_start + i + 1}: {chunk_error}")
                            continue
            
            if not chunk_embeddings:
                error_msg = "Failed to generate embeddings for any chunks"
                logger.error(error_msg)
                if job_id:
                    update_conversion_job(job_id, "failed", error_message=error_msg)
                return jsonify({'error': error_msg}), 500
            
            # Save individual chunk embeddings instead of averaging
            logger.info(f"Saving {len(chunk_embeddings)} individual chunk embeddings to Convex...")
            
            # Save each chunk embedding separately
            saved_chunks = 0
            for i, (chunk_text, chunk_embedding) in enumerate(zip(chunks, chunk_embeddings)):
                try:
                    save_url = f"{convex_url}/api/embeddings/createDocumentEmbedding"
                    save_payload = {
                        'documentId': document_id,
                        'embedding': chunk_embedding,
                        'embeddingModel': 'all-MiniLM-L6-v2',
                        'embeddingDimensions': len(chunk_embedding),
                        'chunkText': chunk_text,
                        'chunkIndex': i,
                        'processingTimeMs': int((time.time() - start_time) * 1000)
                    }
                    
                    save_response = requests.post(save_url, json=save_payload)
                    
                    if save_response.status_code == 200:
                        saved_chunks += 1
                        logger.info(f"Saved chunk {i+1}/{len(chunks)} embedding to Convex")
                    else:
                        logger.error(f"Failed to save chunk {i+1} embedding: {save_response.status_code} - {save_response.text}")
                        
                except Exception as chunk_save_error:
                    logger.error(f"Error saving chunk {i+1} embedding: {chunk_save_error}")
                    continue
            
            if saved_chunks == 0:
                error_msg = "Failed to save any chunk embeddings"
                logger.error(error_msg)
                if job_id:
                    update_conversion_job(job_id, "failed", error_message=error_msg)
                return jsonify({'error': error_msg}), 500
            
            embedding_method = "individual_chunks"
            processing_time = int((time.time() - start_time) * 1000)
            
            # Create notification for successful embedding
            try:
                notification_url = f"{convex_url}/api/notifications"
                notification_payload = {
                    'type': 'document_embedded',
                    'title': 'Document Embedded',
                    'message': f'"{document_title}" chunked into {saved_chunks} searchable pieces',
                    'documentId': document_id,
                    'metadata': json.dumps({
                        'document_title': document_title,
                        'chunks_saved': saved_chunks,
                        'total_chunks': len(chunks),
                        'embedding_dimension': len(chunk_embeddings[0]) if chunk_embeddings else 0,
                        'model': 'all-MiniLM-L6-v2',
                        'processing_time_ms': processing_time,
                        'embedding_method': embedding_method
                    })
                }
                
                notification_response = requests.post(notification_url, json=notification_payload)
                if notification_response.status_code in (200, 201):
                    logger.info("Notification created successfully")
                else:
                    logger.warning(f"Failed to create notification: {notification_response.status_code} - {notification_response.text}")
            except Exception as notification_error:
                logger.error(f"Error creating notification: {notification_error}")
            
            # Update job as completed
            if job_id:
                output_data = {
                    "document_id": document_id,
                    "chunks_saved": saved_chunks,
                    "total_chunks": len(chunks),
                    "embedding_dimension": len(chunk_embeddings[0]) if chunk_embeddings else 0,
                    "model": "all-MiniLM-L6-v2",
                    "content_length": len(text),
                    "embedding_method": embedding_method
                }
                update_conversion_job(job_id, "completed", output_data=json.dumps(output_data), processing_time_ms=processing_time)
            
            return jsonify({
                'success': True,
                'document_id': document_id,
                'chunks_saved': saved_chunks,
                'total_chunks': len(chunks),
                'embedding_dimension': len(chunk_embeddings[0]) if chunk_embeddings else 0,
                'model': 'all-MiniLM-L6-v2',
                'processing_time_ms': processing_time,
                'content_length': len(text),
                'embedding_method': embedding_method
            }), 200
            
        else:
            # Generate single embedding for small documents
            logger.info("Generating single embedding for document...")
            embedding = model.encode([text])[0].tolist()
            logger.info(f"Embedding generated successfully, dimension: {len(embedding)}")
            embedding_method = "single"
        
        # Save embedding back to Convex
        logger.info("Saving embedding back to Convex...")
        save_url = f"{convex_url}/api/embeddings?documentId={document_id}"
        save_payload = {
            'embedding': embedding
        }
        
        save_response = requests.post(save_url, json=save_payload)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        if save_response.status_code == 200:
            logger.info("Embedding saved successfully to Convex")
            
            # Create notification for successful embedding
            try:
                notification_url = f"{convex_url}/api/notifications"
                notification_payload = {
                    'type': 'document_embedded',
                    'title': 'Document Embedded',
                    'message': f'"{document_title}" embedding completed successfully',
                    'documentId': document_id,
                    'metadata': json.dumps({
                        'document_title': document_title,
                        'embedding_dimension': len(embedding),
                        'model': 'all-MiniLM-L6-v2',
                        'processing_time_ms': processing_time,
                        'embedding_method': embedding_method
                    })
                }
                
                notification_response = requests.post(notification_url, json=notification_payload)
                if notification_response.status_code in (200, 201):
                    logger.info("Notification created successfully")
                else:
                    logger.warning(f"Failed to create notification: {notification_response.status_code} - {notification_response.text}")
            except Exception as notification_error:
                logger.error(f"Error creating notification: {notification_error}")
            
            # Update job as completed
            if job_id:
                output_data = {
                    "document_id": document_id,
                    "embedding_dimension": len(embedding),
                    "model": "all-MiniLM-L6-v2",
                    "content_length": len(text),
                    "embedding_method": embedding_method,
                    "chunks_processed": len(chunk_embeddings) if use_chunking and len(text) > chunk_size else 1
                }
                update_conversion_job(job_id, "completed", output_data=json.dumps(output_data), processing_time_ms=processing_time)
            
            return jsonify({
                'success': True,
                'document_id': document_id,
                'embedding_dimension': len(embedding),
                'model': 'all-MiniLM-L6-v2',
                'processing_time_ms': processing_time,
                'content_length': len(text),
                'embedding_method': embedding_method,
                'chunks_processed': len(chunk_embeddings) if use_chunking and len(text) > chunk_size else 1
            }), 200
        else:
            error_msg = f"Failed to save embedding to Convex: {save_response.status_code} - {save_response.text}"
            logger.error(error_msg)
            
            # Update job as failed
            if job_id:
                update_conversion_job(job_id, "failed", error_message=error_msg, processing_time_ms=processing_time)
            
            return jsonify({
                'error': 'Failed to save embedding to Convex',
                'convex_status': save_response.status_code,
                'convex_error': save_response.text
            }), 500
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        error_msg = f"Error in process_document_embedding: {e}"
        logger.error(error_msg, exc_info=True)
        
        # Update job as failed
        if job_id:
            update_conversion_job(job_id, "failed", error_message=str(e), processing_time_ms=processing_time)
        
        return jsonify({'error': str(e)}), 500

@app.route('/process-markdown', methods=['POST'])
def process_markdown_document():
    """Process markdown content with chunking and generate embeddings"""
    start_time = time.time()
    job_id = None
    
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({'error': 'Missing content field in request'}), 400
        
        content = data['content']
        document_id = data.get('document_id')
        convex_url = data.get('convex_url', os.environ.get('CONVEX_URL'))
        chunk_size = data.get('chunk_size', 1000)
        chunk_overlap = data.get('chunk_overlap', 200)
        
        if not convex_url:
            return jsonify({'error': 'Convex URL not provided'}), 400
        
        logger.info(f"Processing markdown document (length: {len(content)})")
        
        # Create conversion job
        job_id = create_conversion_job(
            job_type="markdown_embedding",
            document_id=document_id,
            request_source="web_app"
        )
        
        if job_id:
            update_conversion_job(job_id, "processing")
        
        # Chunk the markdown content
        chunks = chunk_document(content, 'markdown', chunk_size, chunk_overlap)
        logger.info(f"Document chunked into 🧩 {len(chunks)} pieces")
        
        # Generate embeddings for each chunk with memory management
        chunk_embeddings = []
        chunk_texts = []
        
        # Process chunks in smaller batches to prevent memory issues
        batch_size = 2  # Process 2 chunks at a time to reduce memory pressure
        
        for batch_start in range(0, len(chunks), batch_size):
            batch_end = min(batch_start + batch_size, len(chunks))
            batch_chunks = chunks[batch_start:batch_end]
            
            try:
                # Process batch of chunks
                logger.info(f"Processing batch {batch_start//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size} (chunks {batch_start+1}-{batch_end})")
                
                # Generate embeddings for the batch
                batch_embeddings = model.encode(batch_chunks, show_progress_bar=False)
                
                # Add each embedding to the list
                for i, embedding in enumerate(batch_embeddings):
                    chunk_embeddings.append(embedding.tolist())
                    chunk_texts.append(batch_chunks[i])
                    logger.info(f"Generated embedding for chunk {batch_start + i + 1}/{len(chunks)}")
                
                # Force garbage collection after each batch
                import gc
                gc.collect()
                
            except Exception as batch_error:
                logger.error(f"Error processing batch {batch_start//batch_size + 1}: {batch_error}")
                
                # Fallback: try processing chunks individually in this batch
                for i, chunk in enumerate(batch_chunks):
                    try:
                        chunk_embedding = model.encode([chunk], show_progress_bar=False)[0].tolist()
                        chunk_embeddings.append(chunk_embedding)
                        chunk_texts.append(chunk)
                        logger.info(f"Generated embedding for chunk {batch_start + i + 1}/{len(chunks)} (individual fallback)")
                    except Exception as chunk_error:
                        logger.error(f"Error generating embedding for chunk {batch_start + i + 1}: {chunk_error}")
                        continue
        
        if not chunk_embeddings:
            error_msg = "Failed to generate embeddings for any chunks"
            logger.error(error_msg)
            if job_id:
                update_conversion_job(job_id, "failed", error_message=error_msg)
            return jsonify({'error': error_msg}), 500
        
        # Calculate average embedding
        avg_embedding = np.mean(chunk_embeddings, axis=0).tolist()
        logger.info(f"Calculated average embedding from {len(chunk_embeddings)} chunks, dimension: {len(avg_embedding)}")
        
        # Save to Convex
        save_url = f"{convex_url}/api/embeddings"
        save_payload = {
            'text': content,
            'embedding': avg_embedding,
            'document_id': document_id,
            'chunks': chunk_texts,
            'chunk_embeddings': chunk_embeddings,
            'metadata': {
                'content_type': 'markdown',
                'chunk_count': len(chunks),
                'embedding_method': 'chunked_average',
                'model': 'all-MiniLM-L6-v2'
            }
        }
        
        save_response = requests.post(save_url, json=save_payload)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        if save_response.status_code == 200:
            logger.info("Markdown embedding saved successfully to Convex")
            
            # Create notification for successful embedding
            try:
                notification_url = f"{convex_url}/api/notifications"
                notification_payload = {
                    'type': 'document_embedded',
                    'title': 'Document Embedded',
                    'message': f'Markdown document embedding completed successfully',
                    'documentId': document_id,
                    'metadata': json.dumps({
                        'embedding_dimension': len(avg_embedding),
                        'model': 'all-MiniLM-L6-v2',
                        'processing_time_ms': processing_time,
                        'embedding_method': 'chunked_average',
                        'chunks_processed': len(chunk_embeddings)
                    })
                }
                
                notification_response = requests.post(notification_url, json=notification_payload)
                if notification_response.status_code in (200, 201):
                    logger.info("Notification created successfully")
                else:
                    logger.warning(f"Failed to create notification: {notification_response.status_code} - {notification_response.text}")
            except Exception as notification_error:
                logger.error(f"Error creating notification: {notification_error}")
            
            # Update job as completed
            if job_id:
                output_data = {
                    "document_id": document_id,
                    "embedding_dimension": len(avg_embedding),
                    "model": "all-MiniLM-L6-v2",
                    "content_length": len(content),
                    "chunks_processed": len(chunk_embeddings),
                    "embedding_method": "chunked_average"
                }
                update_conversion_job(job_id, "completed", output_data=json.dumps(output_data), processing_time_ms=processing_time)
            
            return jsonify({
                'success': True,
                'document_id': document_id,
                'embedding_dimension': len(avg_embedding),
                'model': 'all-MiniLM-L6-v2',
                'processing_time_ms': processing_time,
                'content_length': len(content),
                'chunks_processed': len(chunk_embeddings),
                'embedding_method': 'chunked_average'
            }), 200
        else:
            error_msg = f"Failed to save to Convex: {save_response.status_code} - {save_response.text}"
            logger.error(error_msg)
            
            # Update job as failed
            if job_id:
                update_conversion_job(job_id, "failed", error_message=error_msg, processing_time_ms=processing_time)
            
            return jsonify({
                'error': 'Failed to save to Convex',
                'convex_status': save_response.status_code,
                'convex_error': save_response.text
            }), 500
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        error_msg = f"Error in process_markdown_document: {e}"
        logger.error(error_msg, exc_info=True)
        
        # Update job as failed
        if job_id:
            update_conversion_job(job_id, "failed", error_message=str(e), processing_time_ms=processing_time)
        
        return jsonify({'error': str(e)}), 500


@app.route('/embed-and-save', methods=['POST'])
def embed_and_save():
    """Generate embeddings and save them to Convex backend (legacy endpoint)"""
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
        
        data = request.get_json()
        if not data or 'document_id' not in data or 'text' not in data:
            return jsonify({'error': 'Missing document_id or text field in request'}), 400
        
        document_id = data['document_id']
        text = data['text']
        convex_url = data.get('convex_url', os.environ.get('CONVEX_URL'))
        
        if not convex_url:
            return jsonify({'error': 'Convex URL not provided'}), 400
        
        # Generate embedding
        embedding = model.encode([text])[0].tolist()
        
        # Save to Convex
        convex_endpoint = f"{convex_url}/updateDocumentEmbedding"
        convex_payload = {
            'documentId': document_id,
            'embedding': embedding
        }
        
        response = requests.post(convex_endpoint, json=convex_payload)
        
        if response.status_code == 200:
            return jsonify({
                'success': True,
                'document_id': document_id,
                'embedding_dimension': len(embedding),
                'model': 'all-MiniLM-L6-v2',
                'convex_response': response.json()
            }), 200
        else:
            logger.error(f"Failed to save to Convex: {response.status_code} - {response.text}")
            return jsonify({
                'error': 'Failed to save embedding to Convex',
                'convex_status': response.status_code,
                'convex_error': response.text
            }), 500
        
    except Exception as e:
        logger.error(f"Error in embed_and_save_to_convex: {e}")
        return jsonify({'error': str(e)}), 500

def get_current_status():
    """Get current service status for periodic reporting"""
    global model, model_loaded, model_loading, model_error
    
    if model_error:
        return {
            'status': 'error',
            'ready': False,
            'message': f'Model error: {model_error}',
            'model': 'all-MiniLM-L6-v2',
            'model_loaded': False,
            'model_loading': False
        }
    elif model_loading:
        return {
            'status': 'loading',
            'ready': False,
            'message': 'Loading sentence transformer model',
            'model': 'all-MiniLM-L6-v2',
            'model_loaded': False,
            'model_loading': True
        }
    elif model_loaded and model is not None:
        return {
            'status': 'healthy',
            'ready': True,
            'message': 'Service is running normally',
            'model': 'all-MiniLM-L6-v2',
            'model_loaded': True,
            'model_loading': False
        }
    else:
        return {
            'status': 'degraded',
            'ready': True,
            'message': 'Service running without model',
            'model': 'all-MiniLM-L6-v2',
            'model_loaded': False,
            'model_loading': False,
            'degraded_mode': True
        }

# Initialize status reporter and start model loading in background thread when module is imported
logger.info("Starting vector-convert-llm service...")

# Add a small delay to ensure convex-backend is fully ready
logger.info("Waiting 3 seconds for convex-backend to be fully ready...")
time.sleep(3)

# Initialize status reporter
try:
    logger.info(f"Initializing status reporter with CONVEX_URL: {CONVEX_URL}")
    status_reporter = StatusReporter(SERVICE_NAME, CONVEX_URL)
    
    # Try to send startup status
    startup_success = status_reporter.send_startup_status()
    if startup_success:
        logger.info(f"✅ Status reporter initialized successfully for service: {SERVICE_NAME}")
        
        # Start periodic status reporting every 30 seconds
        status_reporter.start_periodic_reporting(interval_seconds=30, get_status_callback=get_current_status)
        logger.info("Periodic status reporting started")
    else:
        logger.warning("⚠️ Status reporter initialized but startup status failed - continuing anyway")
        
except Exception as e:
    logger.error(f"❌ Failed to initialize status reporter: {e}")
    logger.warning("Service will continue without status reporting")
    status_reporter = None

model_thread = threading.Thread(target=load_model_async, daemon=True)
model_thread.start()

# Memory monitoring now handled by consolidated metrics endpoint

logger.info("Service initialized, model loading in background...")
logger.info("Available endpoints: /health, /embed, /similarity, /search, /process-document, /process-markdown, /embed-and-save")

if __name__ == '__main__':
    logger.info("Starting minimal vector-convert-llm service...")
    app.run(host='0.0.0.0', port=7999, debug=False, threaded=True)
