import { textToDiagram } from '../src/utils/textToFlow';
import { looksLikeAsciiFlowchart } from '../src/utils/asciiFlow';
import { generateMermaid } from '../src/utils/mermaid';
import { toExportJson } from '../src/utils/diagram';

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${name}`, detail ?? '');
  } else {
    console.log(`ok: ${name}`);
  }
}

const AGENT = `User Idea/Input
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

const BOXED = `+-----------------------+
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

const LOOP = `Start
Validate the uploaded file
If the file is valid, process the data
Otherwise retry
Retry goes back to Validate the uploaded file
Generate a report
End`;

const TITLED = `# Customer Onboarding Flow

1. Sign up
2. Verify email
3. Create workspace`;

const agent = textToDiagram(AGENT);
check('agent nodes = 4', agent.nodes.length === 4, agent.nodes.map((n) => n.data.label));
check('agent edges = 3', agent.edges.length === 3, agent.edges.length);
check(
  'agent groups name + description',
  agent.nodes.some((n) => n.data.label === 'Research Agent\nMarket & Competitor Analysis'),
  agent.nodes.map((n) => n.data.label),
);
check('agent shape inputOutput', agent.nodes[0].data.shape === 'inputOutput', agent.nodes[0].data.shape);

const boxed = textToDiagram(BOXED);
check('boxed nodes = 6', boxed.nodes.length === 6, boxed.nodes.map((n) => n.data.label));
check('boxed edges = 5', boxed.edges.length === 5, boxed.edges.length);
const decision = boxed.nodes.find((n) => n.data.label === 'Valid?');
check('boxed decision shape', decision?.data.shape === 'decision', decision?.data.shape);
const yes = boxed.edges.find((e) => e.label === 'Yes');
const no = boxed.edges.find((e) => e.label === 'No');
check('boxed YES branch', yes?.source === decision?.id, yes);
check('boxed NO branch', no?.source === decision?.id, no);
check('boxed branches converge', yes?.target !== no?.target, { yes, no });

const loop = textToDiagram(LOOP);
const loopEdge = loop.edges.find((e) => e.label === 'Retry');
check('loop edge exists', Boolean(loopEdge), loop.edges);
check(
  'loop points backwards',
  Boolean(loopEdge) &&
    loop.nodes.findIndex((n) => n.id === loopEdge!.target) <
      loop.nodes.findIndex((n) => n.id === loopEdge!.source),
  loopEdge,
);
check(
  'loop keeps decision with Yes/No',
  loop.nodes.some((n) => n.data.shape === 'decision') &&
    loop.edges.some((e) => e.label === 'Yes') &&
    loop.edges.some((e) => e.label === 'No'),
);

const titled = textToDiagram(TITLED);
check('title extracted', titled.title === 'Customer Onboarding Flow', titled.title);
check('title excluded from nodes', titled.nodes.length === 3, titled.nodes.map((n) => n.data.label));

const lr = textToDiagram(AGENT, { direction: 'LR' });
check('LR direction honoured', lr.nodes.length === 4 && lr.edges.length === 3);

check('ascii detected', looksLikeAsciiFlowchart(BOXED));
check('plain text not ascii', !looksLikeAsciiFlowchart(TITLED));

let malformedThrew = false;
try {
  textToDiagram('   \n\n  ');
} catch {
  malformedThrew = true;
}
check('empty input throws gracefully', malformedThrew);

const mermaid = generateMermaid(boxed);
check('mermaid export mentions flowchart', /flowchart/.test(mermaid), mermaid.slice(0, 60));
check('mermaid export contains decision', /Valid\?/.test(mermaid), mermaid);

const json = JSON.parse(toExportJson(boxed)) as { nodes?: unknown[]; edges?: unknown[] };
check('json export has nodes/edges', Array.isArray(json.nodes) && Array.isArray(json.edges), json);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
