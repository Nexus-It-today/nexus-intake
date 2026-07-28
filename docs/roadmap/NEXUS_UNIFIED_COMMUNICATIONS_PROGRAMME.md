# Nexus it today — Unified Communications Programme

## Status

Future programme. Save in the repository now, but do not implement during the current live-app recovery and deployment sprint.

---

# Product vision

One app. One dashboard. Every conversation, customer, order and task in one place.

Users should eventually access:

- CircleLoop calls
- Call recordings
- Voicemail
- WhatsApp
- Outlook email
- Contacts
- Orders
- Tasks
- Notifications

...from a single Nexus web, tablet and mobile application.

---

# Core principle

CircleLoop, WhatsApp and Email are communication channels feeding one shared Nexus Communications Engine.

Do **not** build three separate mini applications.

---

# Foundation data model

## Contact

A person or unresolved identity.

## Contact Identity

One or more identifiers:

- Mobile number
- Telephone number
- WhatsApp number
- Email address
- External platform identity

## Organisation Relationship

Links contacts to:

- Customer
- Merchant
- Driver
- Supplier
- Other organisations

## Conversation

Logical communication thread.

## Interaction

Single event:

- Call
- Voicemail
- Recording
- Email
- WhatsApp
- Internal note

Each interaction stores:

- Channel
- Direction
- Timestamp
- External Event ID
- Conversation ID
- Assigned User
- Contact
- Organisation
- Order / Delivery
- Attachments
- Recording references
- Status

---

# Identity Resolution

Communications may arrive before we know who the person is.

Workflow:

1. Normalise telephone number or email.
2. Search existing identities.
3. Automatically match high-confidence identities.
4. Otherwise create an Unresolved Contact.
5. Continue building the communication timeline.
6. Allow users to:
   - Merge
   - Link
   - Convert
   - Split
7. Preserve complete history.

High confidence:

- Phone number
- WhatsApp identity
- Email address

Medium confidence:

- Company
- Similar email
- Address

Low confidence:

- Name only

---

# Planned Roadmap

## Sprint 1

Communications Foundation

- Contacts
- Contact identities
- Conversations
- Interactions
- Timeline
- Merge
- Split
- Identity Resolution

---

## Sprint 2

CircleLoop

- Click to call
- Call events
- Missed calls
- Voicemail
- Call recordings
- Workload generation
- Notifications

---

## Sprint 3

Outlook

Microsoft Graph integration

- Inbox
- Shared Mailboxes
- Reply
- Forward
- Send
- Attachments
- Email threading
- Contact matching

---

## Sprint 4

WhatsApp Business

- Messages
- Templates
- Attachments
- Read receipts
- Contact matching
- Timeline

---

## Sprint 5

Unified Mobile Experience

- Responsive tablet UI
- iOS
- Android
- Push notifications
- One communication centre

---

# User Experience

Every communication appears in one timeline.

Example:

Unknown WhatsApp

↓

Incoming CircleLoop Call

↓

Call Recording

↓

Outlook Email

↓

Customer Identified

↓

Order Created

↓

Delivery Completed

The communication channel is simply another icon.

The customer experiences one Nexus conversation.

---

# Current Sprint

Do **not** implement this programme during the current redesign.

Store this document in the roadmap.

Return immediately to:

- Live redesign
- Build
- Lint
- Commit
- Deploy

---

# Product Vision

Call it.

Email it.

Message it.

Order it.

Track it.

**Just Nexus it.**
