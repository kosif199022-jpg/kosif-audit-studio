---
name: whatsapp-messaging
description: Send WhatsApp text messages, images, PDFs and files through the user's private KOSIF WhatsApp bridge, read messages they received, list their groups, schedule a message, or check whether the bridge is linked. Use when the user asks to send, attach, schedule, read or check anything on WhatsApp.
---

# KOSIF WhatsApp messaging

Use the MCP tools from the `kosif-whatsapp` server.

## Fast-send behavior

For a normal send request, prioritize speed and use exactly one send tool call.

- Do NOT call `get_whatsapp_status` before sending.
- Do NOT add planning, explanation, recap or follow-up questions when the recipient and message/file are already clear.
- Normalize the phone number (digits only, international) and call the relevant send tool.
- After a successful tool result, reply exactly: `تم ✅`
- After a failed tool result, reply with one short error sentence only.
- Do not repeat the recipient number, message text or file name after success.

## Authentication key

The MCP tools require the user's private bridge key as the `key` argument.

- If the key is already available in the conversation, use it without repeating or displaying it.
- If it is not available, ask only for the bridge key, with no extra explanation.
- Never include the key in prose, summaries, logs or confirmations, and never store it in plugin files.

## Send a message with files (preferred)

When the user asks to send a message together with one or more files, call `send_whatsapp_bundle` once:

- `message`: the text, sent first.
- `attachments`: the files, in order. For the user's CVs use `{"stored": "cv-ar"}` (Arabic) and `{"stored": "cv-en"}` (English); never re-upload them as base64.
- `idempotencyKey`: a short unique string for this request (e.g. `send-<recipient>-<timestamp>`). To retry after an error, retry with the same key: items that already went out are not sent again.
- The send is done only when the tool says `sent N item(s)` or `already sent earlier`. `not fully sent` means some items were not delivered; report that in one short sentence.

## Send text

Call `send_whatsapp_message` with `key`, `to` (digits only, or a group id from `list_whatsapp_groups`) and `message` (exactly what the user asked to send, unless they asked you to draft it).

## Send a PDF, image or file

Call `send_whatsapp_file`. Use `stored` for the CVs, `fileUrl` when an HTTPS URL is available, otherwise `fileBase64`. Include `filename` and `mimetype` when known; `caption` is the accompanying text. Images are sent as images, PDFs and other files as documents, audio/video in their native form. Do not claim a file was sent unless the tool returns success.

## Read received messages

Call `list_whatsapp_messages` when the user asks what someone wrote, wants a summary of recent messages, or wants to reply to something. Filter with `from` (a phone number) or `chat` (a group id). `sync: true` (default) fetches new messages from WhatsApp first and takes longer; use `sync: false` when the user wants a quick look at what is already known.

## Groups

Recipients can be groups. When the user names a group, call `list_whatsapp_groups` once to find its id, then send to that id.

## Schedule

Call `schedule_whatsapp_message` with an ISO-8601 `at` that includes the user's timezone offset (Egypt is `+03:00` in summer, `+02:00` in winter). Confirm the time back in one short line.

## Delivery status and connection

Use `get_whatsapp_job` with an idempotency key to confirm what was delivered. Use `get_whatsapp_status` only when the user explicitly asks about the connection, or after a send fails with a connection error. If the bridge reports it is not linked, tell the user to open the bridge's `/pair` page and link with the QR code or a phone-number pairing code.
