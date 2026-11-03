import type { AiDiagram, FlowDiagram, LayoutDirection } from '../types/diagram';
import { normalizeAiDiagram } from './diagram';
import { layoutDiagram } from '../editor/layout';

export const ORDER_PROCESS_SAMPLE: AiDiagram = {
  direction: 'TB',
  nodes: [
    { id: 'start', label: 'Order received', shape: 'startEnd' },
    { id: 'validate', label: 'Validate order details', shape: 'process' },
    { id: 'payment', label: 'Payment approved?', shape: 'decision' },
    { id: 'pack', label: 'Pack items', shape: 'process' },
    { id: 'invoice', label: 'Generate invoice', shape: 'document' },
    { id: 'ship', label: 'Ship order', shape: 'inputOutput' },
    { id: 'notify', label: 'Notify customer of failure', shape: 'process', color: 'rose' },
    { id: 'end', label: 'Order complete', shape: 'startEnd' },
  ],
  edges: [
    { source: 'start', target: 'validate' },
    { source: 'validate', target: 'payment' },
    { source: 'payment', target: 'pack', label: 'Yes' },
    { source: 'payment', target: 'notify', label: 'No' },
    { source: 'pack', target: 'invoice' },
    { source: 'invoice', target: 'ship' },
    { source: 'ship', target: 'end' },
    { source: 'notify', target: 'end' },
  ],
};

export const SUPPORT_TICKET_SAMPLE: AiDiagram = {
  direction: 'TB',
  nodes: [
    { id: 'start', label: 'Ticket submitted', shape: 'startEnd' },
    { id: 'classify', label: 'Classify ticket', shape: 'process' },
    { id: 'urgent', label: 'Urgent?', shape: 'decision' },
    { id: 'escalate', label: 'Escalate to on-call', shape: 'process', color: 'rose' },
    { id: 'backlog', label: 'Add to sprint backlog', shape: 'process' },
    { id: 'update', label: 'Send customer update', shape: 'inputOutput' },
    { id: 'end', label: 'Ticket resolved', shape: 'startEnd' },
  ],
  edges: [
    { source: 'start', target: 'classify' },
    { source: 'classify', target: 'urgent' },
    { source: 'urgent', target: 'escalate', label: 'Yes' },
    { source: 'urgent', target: 'backlog', label: 'No' },
    { source: 'escalate', target: 'update' },
    { source: 'backlog', target: 'update' },
    { source: 'update', target: 'end' },
  ],
};

export const SAMPLE_WORKFLOW_TEXT = `1. Customer submits a support ticket
2. Classify the ticket by topic and urgency
3. If the ticket is urgent, escalate it to the on-call engineer
4. Otherwise add it to the sprint backlog
5. Send the customer an update
6. Resolve and close the ticket`;

export const SAMPLE_AGENT_WORKFLOW = `User Idea/Input
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
System Design`;

export const SAMPLE_ASCII_FLOWCHART = `+-----------------------+
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
      End`;

export const SAMPLE_LOOP_WORKFLOW = `Start
Validate the uploaded file
If the file is valid, process the data
Otherwise retry
Retry goes back to Validate the uploaded file
Generate a report
End`;

export const SAMPLE_PROMPTS = [
  'A user signs in, the system validates their credentials, and if valid they see the dashboard; otherwise they receive an error message.',
  'An online order is validated, paid, packed, invoiced, shipped, and the customer receives a confirmation email.',
  'A support ticket is classified, urgent tickets are escalated, normal tickets go to the backlog, then the customer is updated.',
  'An employee uploads a document, the system checks the file type, extracts the text, and stores it in the archive.',
];

function buildSample(input: AiDiagram): FlowDiagram {
  return normalizeAiDiagram(input).diagram;
}

export const SAMPLE_DIAGRAMS: Record<string, { label: string; diagram: FlowDiagram }> = {
  order: {
    label: 'Order processing',
    diagram: buildSample(ORDER_PROCESS_SAMPLE),
  },
  support: {
    label: 'Support ticket triage',
    diagram: buildSample(SUPPORT_TICKET_SAMPLE),
  },
};

export function createInitialDiagram(): FlowDiagram {
  return buildSample(ORDER_PROCESS_SAMPLE);
}

export function getSampleDiagram(
  key: 'order' | 'support',
  direction: LayoutDirection = 'TB',
): FlowDiagram {
  return layoutDiagram(SAMPLE_DIAGRAMS[key].diagram, direction);
}

export const SAMPLE_SCREENSHOT_URL = `${import.meta.env.BASE_URL}samples/support-ticket-flow.png`;
