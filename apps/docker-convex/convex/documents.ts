// apps/docker-convex/convex/documents.ts
import { mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// Save a new document to the RAG system
export const saveDocument = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    contentType: v.string(), // "markdown" or "text"
    tags: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const wordCount = args.content.split(/\s+/).filter(word => word.length > 0).length;
    const fileSize = args.content.length; // Simple character count for file size

    const documentId = await ctx.db.insert("rag_documents", {
      title: args.title,
      content: args.content,
      contentType: args.contentType,
      fileSize,
      uploadedAt: now,
      lastModified: now,
      isActive: true,
      tags: args.tags,
      summary: args.summary,
      wordCount,
      hasEmbedding: false, // Will be set to true when embedding is generated
    });

    // Create notification for document upload
    await ctx.runMutation(api.notifications.createNotification, {
      type: "document_upload",
      title: "Document Uploaded",
      message: `Document "${args.title}" has been uploaded successfully`,
      documentId: documentId,
      metadata: JSON.stringify({
        contentType: args.contentType,
        fileSize: fileSize,
        wordCount: wordCount
      }),
      source: "system"
    });

    // Schedule embedding generation (async)
    await ctx.scheduler.runAfter(0, internal.embeddings.processDocumentEmbedding, {
      documentId: documentId,
    });

    return documentId;
  },
});



// Get all documents with pagination
export const getAllDocuments = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const documents = await ctx.db
      .query("rag_documents")
      .withIndex("by_active_and_date", (q) => q.eq("isActive", true))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    return documents;
  },
});

// Get a specific document by ID
export const getDocumentById = query({
  args: { documentId: v.id("rag_documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId);
  },
});

// Update document content
export const updateDocument = mutation({
  args: {
    documentId: v.id("rag_documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { documentId, ...updates } = args;
    const now = Date.now();
    
    const updateData: any = {
      ...updates,
      lastModified: now,
    };

    // Recalculate word count and file size if content is updated
    if (updates.content) {
      updateData.wordCount = updates.content.split(/\s+/).filter(word => word.length > 0).length;
      updateData.fileSize = updates.content.length; // Simple character count for file size
      updateData.hasEmbedding = false; // Reset embedding flag when content changes
    }

    await ctx.db.patch(documentId, updateData);
    return documentId;
  },
});

// Delete a document (soft delete by setting isActive to false)
export const deleteDocument = mutation({
  args: { documentId: v.id("rag_documents") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      isActive: false,
      lastModified: Date.now(),
    });
    return args.documentId;
  },
});

// Search documents by content
export const searchDocuments = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    
    const results = await ctx.db
      .query("rag_documents")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.searchTerm).eq("isActive", true)
      )
      .take(limit);

    return results;
  },
});

// Get document statistics
export const getDocumentStats = query({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db
      .query("rag_documents")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const totalDocuments = allDocs.length;
    const totalWords = allDocs.reduce((sum, doc) => sum + doc.wordCount, 0);
    const totalSize = allDocs.reduce((sum, doc) => sum + doc.fileSize, 0);
    
    const contentTypes = allDocs.reduce((acc, doc) => {
      acc[doc.contentType] = (acc[doc.contentType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalDocuments,
      totalWords,
      totalSize,
      contentTypes,
    };
  },
});

// Get document upload statistics based on timestamps
export const getDocumentUploadStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Get all active documents
    const allDocs = await ctx.db
      .query("rag_documents")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    // Calculate upload statistics
    const totalDocuments = allDocs.length;
    const uploadsLastHour = allDocs.filter(doc => doc.uploadedAt >= oneHourAgo).length;
    const uploadsLastDay = allDocs.filter(doc => doc.uploadedAt >= oneDayAgo).length;
    
    return {
      totalDocuments,
      uploadsLastHour,
      uploadsLastDay,
    };
  },
});