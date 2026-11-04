/**
 * Intelligence evaluation corpus.
 *
 * Each case targets one input category. The reference expectations are
 * semantic (key steps, decisions, branches, relationships), not exact pixel
 * graphs, because a valid flowchart can express the same process in more than
 * one way. Screenshot accuracy is measured from OCR text, because raster
 * fixtures are not committed to the repository; the OCR/geometry path itself
 * is exercised separately in the browser.
 */
import type { InputKind } from '../src/types/diagram';

export interface EvalCase {
  id: string;
  category: string;
  input: string;
  expectedKind: InputKind;
  skipClassification?: boolean;
  expected: {
    nodes: string[];
    decisions?: string[];
    branches?: string[];
    edges?: Array<[string, string]>;
    cycles?: boolean;
    objective?: string;
  };
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'natural-language-form',
    category: 'Natural language',
    input:
      'A user submits a form. The system validates the form. If the form is valid, save the form and show a confirmation. Otherwise show an error message and ask the user to fix the form.',
    expectedKind: 'natural-language',
    expected: {
      nodes: [
        'Start',
        'Submit form',
        'Validate form',
        'Form valid?',
        'Save form',
        'Show confirmation',
        'Show error message',
        'Ask user to fix form',
        'End',
      ],
      decisions: ['Form valid?'],
      branches: ['Yes', 'No'],
      edges: [
        ['Submit form', 'Validate form'],
        ['Validate form', 'Form valid?'],
        ['Form valid?', 'Save form'],
        ['Form valid?', 'Show error message'],
      ],
      cycles: false,
    },
  },
  {
    id: 'chatgpt-response-onboarding',
    category: 'ChatGPT response',
    input: `Sure! Here's a simple employee onboarding workflow:

**Create the record:** HR creates the employee record.
**Provision access:** IT provisions the account and assigns a laptop.
**Schedule orientation:** The manager schedules orientation.
**Complete training:** The employee completes compliance training.

Let me know if you'd like this expanded or changed.`,
    expectedKind: 'chatgpt-response',
    expected: {
      nodes: [
        'Start',
        'HR creates the employee record',
        'IT provisions the account',
        'Assigns a laptop',
        'Manager schedules orientation',
        'Employee completes compliance training',
        'End',
      ],
      edges: [
        ['HR creates the employee record', 'IT provisions the account'],
        ['IT provisions the account', 'Assigns a laptop'],
        ['Assigns a laptop', 'Manager schedules orientation'],
        ['Manager schedules orientation', 'Employee completes compliance training'],
      ],
      cycles: false,
    },
  },
  {
    id: 'ascii-validation',
    category: 'ASCII diagram',
    input: `+-----------------------+
|      User Input       |
+-----------------------+
           |
           v
+-----------------------+
|    Data Processing    |
+-----------------------+
           |
           v
      +---------+
      | Valid?  |
      +---------+
        /     \\
      Yes      No
       |        |
       v        v
   Continue   Retry
       |
       v
      End`,
    expectedKind: 'ascii',
    expected: {
      nodes: ['User Input', 'Data Processing', 'Valid?', 'Continue', 'Retry', 'End'],
      decisions: ['Valid?'],
      branches: ['Yes', 'No'],
      edges: [
        ['User Input', 'Data Processing'],
        ['Data Processing', 'Valid?'],
      ],
      cycles: false,
    },
  },
  {
    id: 'screenshot-ocr-login',
    category: 'Screenshot (OCR text)',
    input: `Start
Open the mobile app
Scan the QR code
QR code valid?
Yes: Confirm the login
No: Show an error
End`,
    expectedKind: 'screenshot',
    skipClassification: true,
    expected: {
      nodes: [
        'Start',
        'Open the mobile app',
        'Scan the QR code',
        'QR code valid?',
        'Confirm the login',
        'Show an error',
        'End',
      ],
      decisions: ['QR code valid?'],
      branches: ['Yes', 'No'],
      cycles: false,
    },
  },
  {
    id: 'mermaid-approval-loop',
    category: 'Mermaid',
    input: `flowchart TD
  A[Start] --> B[Receive request]
  B --> C{Complete?}
  C -- Yes --> D[Approve request]
  C -- No --> E[Request more information]
  E --> B
  D --> F[End]`,
    expectedKind: 'mermaid',
    expected: {
      nodes: [
        'Start',
        'Receive request',
        'Complete?',
        'Approve request',
        'Request more information',
        'End',
      ],
      decisions: ['Complete?'],
      branches: ['Yes', 'No'],
      edges: [
        ['Receive request', 'Complete?'],
        ['Request more information', 'Receive request'],
        ['Approve request', 'End'],
      ],
      cycles: true,
    },
  },
  {
    id: 'numbered-support-triage',
    category: 'Numbered steps',
    input: `1. Customer submits a support ticket
2. Classify the ticket by topic and urgency
3. If the ticket is urgent, escalate it to the on-call engineer
4. Otherwise add it to the sprint backlog
5. Send the customer an update
6. Resolve and close the ticket`,
    expectedKind: 'numbered-steps',
    expected: {
      nodes: [
        'Start',
        'Customer submits a support ticket',
        'Classify the ticket',
        'Urgent?',
        'Escalate to the on-call engineer',
        'Add to the sprint backlog',
        'Send the customer an update',
        'Resolve and close the ticket',
        'End',
      ],
      decisions: ['Urgent?'],
      branches: ['Yes', 'No'],
      edges: [
        ['Customer submits a support ticket', 'Classify the ticket'],
        ['Classify the ticket', 'Urgent?'],
        ['Urgent?', 'Escalate to the on-call engineer'],
        ['Urgent?', 'Add to the sprint backlog'],
      ],
      cycles: false,
    },
  },
  {
    id: 'technical-webhook-api',
    category: 'Technical documentation',
    input: `## Webhook processing

The API endpoint receives the request payload. The server validates the schema. If the schema is valid, the event is queued and a 200 response is returned. Otherwise a 400 error response is returned.`,
    expectedKind: 'technical-doc',
    expected: {
      nodes: [
        'Start',
        'API endpoint receives the request payload',
        'Server validates the schema',
        'Schema valid?',
        'Event is queued',
        '200 response is returned',
        '400 error response is returned',
        'End',
      ],
      decisions: ['Schema valid?'],
      branches: ['Yes', 'No'],
      cycles: false,
    },
  },
  {
    id: 'agent-content-pipeline',
    category: 'Agent workflow',
    input: `User Idea/Input
       |
       v
Research Agent
Market & Competitor Analysis
       |
       v
Planning Agent
Requirements & Features
       |
       v
Architecture Agent
System Design`,
    expectedKind: 'agent-workflow',
    expected: {
      nodes: [
        'Start',
        'User Idea/Input',
        'Research Agent: Market & Competitor Analysis',
        'Planning Agent: Requirements & Features',
        'Architecture Agent: System Design',
        'End',
      ],
      edges: [
        ['User Idea/Input', 'Research Agent: Market & Competitor Analysis'],
        ['Research Agent: Market & Competitor Analysis', 'Planning Agent: Requirements & Features'],
        ['Planning Agent: Requirements & Features', 'Architecture Agent: System Design'],
      ],
      cycles: false,
    },
  },
  {
    id: 'architecture-order-service',
    category: 'Software architecture',
    input:
      'The client calls the API gateway. The gateway routes the request to the authentication service, then to the order service. The order service reads and writes the database and publishes an event to the message queue. A notification service consumes the event and sends a notification.',
    expectedKind: 'architecture',
    expected: {
      nodes: [
        'Start',
        'Client',
        'API gateway',
        'Authentication service',
        'Order service',
        'Database',
        'Message queue',
        'Notification service',
        'End',
      ],
      cycles: false,
    },
  },
  {
    id: 'business-order-fulfillment',
    category: 'Business process',
    input:
      'A customer places an order. The system checks inventory. If the item is in stock, the order is confirmed and a payment is collected. Otherwise the customer is notified that the item is out of stock and a refund is issued.',
    expectedKind: 'business-process',
    expected: {
      nodes: [
        'Start',
        'Customer places an order',
        'System checks inventory',
        'Item in stock?',
        'Order is confirmed',
        'Payment is collected',
        'Customer is notified',
        'Refund is issued',
        'End',
      ],
      decisions: ['Item in stock?'],
      branches: ['Yes', 'No'],
      edges: [
        ['Customer places an order', 'System checks inventory'],
        ['System checks inventory', 'Item in stock?'],
      ],
      cycles: false,
    },
  },
];
