import type { FlowDiagram, FlowNode, NodeShape } from '../types/diagram';
import { defaultColorForShape } from '../editor/nodeTheme';
import { decisionFromCheck } from './nlp';

const START_LABEL =
  /^(?:start|begin|entry|kick off|trigger|initiate|submit|receive|upload|enter|input|user input|order received|ticket submitted)\b/i;
const END_LABEL =
  /^(?:end|finish|finished|done|complete|completed|close|closed|resolve|resolved|stop|terminate|exit|halt|deliver|confirmed)\b/i;
const IO_LABEL =
  /^(?:enter|input|upload|read|receive|get|collect|select|choose|send|show|display|output|print|notify|email|return|provide|submit|present|fetch|download|load|ask|request|confirm)\b/i;
const DOCUMENT_LABEL =
  /\b(document|report|invoice|receipt|log|record|letter|contract|form|archive|spreadsheet|summary|email|notification)\b/i;
const DECISION_HINT =
  /\?|\b(?:valid|validated|approved|successful|eligible|available|authorized|authenticated|qualified|passed|failed|complete|within|enough|exists|allowed|correct|verified)\b/i;

function questionLabel(label: string): boolean {
  return /\?\s*$/.test(label.trim());
}

function branchCount(node: FlowNode, diagram: FlowDiagram): number {
  return diagram.edges.filter((edge) => edge.source === node.id).length;
}

function incomingCount(node: FlowNode, diagram: FlowDiagram): number {
  return diagram.edges.filter((edge) => edge.target === node.id).length;
}

/**
 * Re-classifies shapes using the node's role in the graph, not just a keyword.
 * For example, a "Payment" node with two outgoing branches becomes a decision
 * even if its label does not end in a question mark, while a terminal report
 * node stays a document instead of being turned into a process rectangle.
 */
export function refineDiagramShapes(diagram: FlowDiagram): {
  diagram: FlowDiagram;
  notes: string[];
} {
  const notes: string[] = [];
  const firstNode = diagram.nodes[0];
  const lastNode = diagram.nodes[diagram.nodes.length - 1];

  const nodes = diagram.nodes.map((node): FlowNode => {
    const label = node.data.label.trim();
    const flat = label.replace(/\s+/g, ' ');
    const outgoing = branchCount(node, diagram);
    const incoming = incomingCount(node, diagram);

    let shape: NodeShape = 'process';

    const decisionByGraph = outgoing >= 2 && !START_LABEL.test(flat) && !END_LABEL.test(flat);
    const decisionByText =
      questionLabel(flat) ||
      (outgoing >= 2 &&
        (Boolean(decisionFromCheck(flat)) ||
          (/^(?:if|whether|check|verify|validate|decide|determine)\b/i.test(flat) &&
            DECISION_HINT.test(flat))));

    if (node.id === firstNode?.id && incoming === 0 && !decisionByText) {
      shape = 'startEnd';
    } else if (START_LABEL.test(flat) && incoming <= 1 && !decisionByText) {
      shape = 'startEnd';
    } else if (END_LABEL.test(flat) && outgoing === 0) {
      shape = 'startEnd';
    } else if (decisionByText || decisionByGraph) {
      shape = 'decision';
    } else if (DOCUMENT_LABEL.test(flat)) {
      shape = 'document';
    } else if (IO_LABEL.test(flat)) {
      shape = 'inputOutput';
    } else if (/^(?:connector|off[- ]page|jump)\b/i.test(flat)) {
      shape = 'connector';
    } else if (node.id === lastNode?.id && outgoing === 0 && incoming > 0 && !DOCUMENT_LABEL.test(flat)) {
      // A plain terminal step is not automatically a Terminator symbol; only
      // explicit "End/Finish/Done" labels use startEnd.
      shape = 'process';
    }

    if (shape === node.data.shape) {
      return {
        ...node,
        data: {
          ...node.data,
          rationale: node.data.rationale ?? shapeRationale(shape, outgoing, incoming),
        },
      };
    }

    const previousDefault = defaultColorForShape(node.data.shape);
    notes.push(`“${label}” fits a ${shape} symbol based on its role.`);
    return {
      ...node,
      data: {
        ...node.data,
        shape,
        color: node.data.color === previousDefault ? defaultColorForShape(shape) : node.data.color,
        rationale: shapeRationale(shape, outgoing, incoming),
      },
    };
  });

  return { diagram: { ...diagram, nodes }, notes };
}

function shapeRationale(shape: NodeShape, outgoing: number, incoming: number): string {
  switch (shape) {
    case 'startEnd':
      return incoming === 0 ? 'Entry point (no incoming flow).' : 'Terminal step (no outgoing flow).';
    case 'decision':
      return outgoing >= 2
        ? `Graph gate with ${outgoing} outgoing branches.`
        : 'Label expresses a condition or verification.';
    case 'inputOutput':
      return 'Action exchanges or presents information.';
    case 'document':
      return 'Produces or stores a document/record.';
    case 'connector':
      return 'Acts as a jump/off-page connector.';
    default:
      return 'Ordinary processing step.';
  }
}
