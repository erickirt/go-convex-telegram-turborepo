import { httpAction } from "./_generated/server"
import { api } from "./_generated/api"
import type { ActionCtx } from "./_generated/server"

// HTTP API endpoint for the Go bot to save messages
export const saveMessageAPI = httpAction(async (ctx: ActionCtx, request: Request) => {
  // Parse the request body
  const body = await request.json()

  // Validate required fields
  if (!body.messageId || !body.chatId || !body.text) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: messageId, chatId, text",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  try {
    // Save the message using the enhanced mutation with better thread handling
    const messageId = await ctx.runMutation(api.messagesThread.saveMessageWithThreadHandling, {
      messageId: body.messageId,
      chatId: body.chatId,
      userId: body.userId,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,
      text: body.text,
      messageType: body.messageType || "text",
      timestamp: body.timestamp || Date.now(),
      messageThreadId: body.messageThreadId,
      replyToMessageId: body.replyToMessageId,
    })

    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
        message: "Message saved successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("Error saving message:", error)
    return new Response(
      JSON.stringify({
        error: "Failed to save message",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
})

// HTTP API endpoint for saving messages to specific threads
export const saveMessageToThreadAPI = httpAction(async (ctx: ActionCtx, request: Request) => {
  // Parse the request body
  const body = await request.json()

  // Validate required fields
  if (!body.messageId || !body.chatId || !body.text || !body.threadDocId) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: messageId, chatId, text, threadDocId",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  try {
    // Save the message directly to the specified thread
    const messageId = await ctx.runMutation(api.messagesThread.saveMessageToThread, {
      messageId: body.messageId,
      chatId: body.chatId,
      userId: body.userId,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,
      text: body.text,
      messageType: body.messageType || "bot_message",
      timestamp: body.timestamp || Date.now(),
      messageThreadId: body.messageThreadId,
      threadDocId: body.threadDocId,
      replyToMessageId: body.replyToMessageId,
    })

    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
        message: "Message saved to thread successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("Error saving message to thread:", error)
    return new Response(
      JSON.stringify({
        error: "Failed to save message to thread",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
})

// HTTP API endpoint to get messages
export const getMessagesAPI = httpAction(async (ctx: ActionCtx, request: Request) => {
  const url = new URL(request.url)
  const chatId = url.searchParams.get("chatId")
  const limit = url.searchParams.get("limit")

  try {
    let messages
    if (chatId) {
      messages = await ctx.runQuery(api.messages.getMessagesByChatId, {
        chatId: Number.parseInt(chatId),
        limit: limit ? Number.parseInt(limit) : undefined,
      })
    } else {
      messages = await ctx.runQuery(api.messages.getAllMessages, {
        limit: limit ? Number.parseInt(limit) : undefined,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        messages: messages,
        count: messages.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    console.error("Error fetching messages:", error)
    return new Response(
      JSON.stringify({
        error: "Failed to fetch messages",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
})
