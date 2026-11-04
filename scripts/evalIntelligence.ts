/**
 * Runs the intelligence evaluation corpus through the local engine and prints
 * honest per-category metrics. No AI credentials are required.
 */
import type { FlowDiagram, FlowNode } from '../src/types/diagram';
import { buildLocalIntelligence } from '../src/intelligence/pipeline';
import { analyzeGraph } from '../src/intelligence/graphEngine';
import { wordOverlap } from '../src/intelligence/nlp';
import { EVAL_CASES, type EvalCase } from './evalCorpus';

interface CaseResult {
  id: string;
  category: string;
  pass: boolean;
  kindOk: boolean;
  actualKind: string;
  expectedKind: string;
  kindConfidence: number;
  nodeRecall: number;
  nodePrecision: number;
  decisionRecall: number | null;
  branchRecall: number | null;
  edgeRecall: number | null;
  cycleOk: boolean;
  objectiveOk: boolean | null;
  quality: number;
  nodeCount: number;
  edgeCount: number;
  missingNodes: string[];
  missingDecisions: string[];
  missingBranches: string[];
  missingEdges: string[];
  extraNodes: string[];
  warnings: string[];
}

function clean(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nodeScore(node: FlowNode, expected: string): number {
  const target = clean(expected);
  const label = clean(node.data.label);
  if (!target || !label) return 0;
  if (label === target) return 1;
  if (label.includes(target) || target.includes(label)) {
    const shorter = Math.min(label.length, target.length);
    const longer = Math.max(label.length, target.length);
    // "resolve" must not satisfy "resolve and close the ticket".
    return shorter / longer >= 0.6 ? 0.9 : wordOverlap(node.data.label, expected);
  }
  return wordOverlap(node.data.label, expected);
}

/**
 * Greedy one-to-one label matching. A single node cannot satisfy two reference
 * labels, which keeps recall and precision from being inflated.
 */
function matchExpected(
  diagram: FlowDiagram,
  labels: string[],
  shape?: 'decision',
): Map<string, FlowNode | undefined> {
  const used = new Set<string>();
  const result = new Map<string, FlowNode | undefined>();
  const threshold = shape ? 0.45 : 0.55;

  for (const label of labels) {
    let best: { node: FlowNode; score: number } | undefined;
    for (const node of diagram.nodes) {
      if (used.has(node.id)) continue;
      if (shape && node.data.shape !== shape) continue;
      const score = nodeScore(node, label);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { node, score };
    }
    if (best && best.score >= threshold) {
      result.set(label, best.node);
      used.add(best.node.id);
    } else {
      result.set(label, undefined);
    }
  }
  return result;
}

function findNode(diagram: FlowDiagram, expected: string): FlowNode | undefined {
  let best: { node: FlowNode; score: number } | undefined;
  for (const node of diagram.nodes) {
    const score = nodeScore(node, expected);
    if (!best || score > best.score) best = { node, score };
  }
  return best && best.score >= 0.55 ? best.node : undefined;
}

function hasBranch(diagram: FlowDiagram, label: string): boolean {
  const target = clean(label);
  return diagram.edges.some((edge) => clean(String(edge.label ?? '')) === target);
}

function evaluate(
  testCase: EvalCase,
  diagram: FlowDiagram,
  actualKind: string,
  kindConfidence: number,
  objective: string | undefined,
  warnings: string[],
): CaseResult {
  const { expected } = testCase;

  const nodeMatches = matchExpected(diagram, expected.nodes);
  const missingNodes = expected.nodes.filter((label) => !nodeMatches.get(label));  const nodeRecall =
    expected.nodes.length === 0 ? 1 : (expected.nodes.length - missingNodes.length) / expected.nodes.length;

  const matchedActualIds = new Set(
    [...nodeMatches.values()]
      .filter((node): node is FlowNode => Boolean(node))
      .map((node) => node.id),
  );
  const nodePrecision =
    diagram.nodes.length === 0 ? 1 : matchedActualIds.size / diagram.nodes.length;
  const extraNodes = diagram.nodes
    .filter((node) => !matchedActualIds.has(node.id))
    .map((node) => node.data.label);

  const decisions = expected.decisions ?? [];
  const decisionMatches = matchExpected(diagram, decisions, 'decision');
  const missingDecisions = decisions.filter((label) => !decisionMatches.get(label));
  const decisionRecall =
    decisions.length === 0 ? null : (decisions.length - missingDecisions.length) / decisions.length;

  const branches = expected.branches ?? [];
  const missingBranches = branches.filter((label) => !hasBranch(diagram, label));
  const branchRecall =
    branches.length === 0 ? null : (branches.length - missingBranches.length) / branches.length;

  const expectedEdges = expected.edges ?? [];
  const missingEdges = expectedEdges
    .filter(([source, target]) => {
      const from = nodeMatches.get(source) ?? findNode(diagram, source);
      const to = nodeMatches.get(target) ?? findNode(diagram, target);
      if (!from || !to) return true;
      return !diagram.edges.some((edge) => edge.source === from.id && edge.target === to.id);
    })
    .map(([source, target]) => `${source} -> ${target}`);
  const edgeRecall =
    expectedEdges.length === 0 ? null : (expectedEdges.length - missingEdges.length) / expectedEdges.length;

  const report = analyzeGraph(diagram);
  const expectedCyclic = Boolean(expected.cycles);
  const cycleOk = report.cyclic === expectedCyclic;
  const objectiveOk =
    expected.objective === undefined
      ? null
      : clean(objective ?? '').includes(clean(expected.objective));
  const quality = Math.min(1, Math.max(0, report.score / 100));

  const kindOk = testCase.skipClassification
    ? true
    : actualKind === testCase.expectedKind;

  const pass =
    kindOk &&
    nodeRecall >= 0.75 &&
    (decisionRecall === null || decisionRecall >= 0.75) &&
    (branchRecall === null || branchRecall >= 0.75) &&
    (edgeRecall === null || edgeRecall >= 0.75) &&
    cycleOk &&
    (objectiveOk === null || objectiveOk);

  return {
    id: testCase.id,
    category: testCase.category,
    pass,
    kindOk,
    actualKind,
    expectedKind: testCase.expectedKind,
    kindConfidence,
    nodeRecall,
    nodePrecision,
    decisionRecall,
    branchRecall,
    edgeRecall,
    cycleOk,
    objectiveOk,
    quality,
    nodeCount: diagram.nodes.length,
    edgeCount: diagram.edges.length,
    missingNodes,
    missingDecisions,
    missingBranches,
    missingEdges,
    extraNodes,
    warnings: warnings.slice(0, 3),
  };
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

async function main() {
  const results: CaseResult[] = [];

  for (const [index, testCase] of EVAL_CASES.entries()) {
    try {
      const result = await buildLocalIntelligence(testCase.input, { direction: 'TB' });
      results.push(
        evaluate(
          testCase,
          result.diagram,
          result.classification.kind,
          result.classification.confidence,
          result.analysis.objective,
          result.analysis.warnings,
        ),
      );
    } catch (error) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        pass: false,
        kindOk: false,
        actualKind: 'error',
        expectedKind: testCase.expectedKind,
        kindConfidence: 0,
        nodeRecall: 0,
        nodePrecision: 0,
        decisionRecall: null,
        branchRecall: null,
        edgeRecall: null,
        cycleOk: false,
        objectiveOk: null,
        quality: 0,
        nodeCount: 0,
        edgeCount: 0,
        missingNodes: testCase.expected.nodes,
        missingDecisions: testCase.expected.decisions ?? [],
        missingBranches: testCase.expected.branches ?? [],
        missingEdges: (testCase.expected.edges ?? []).map(([a, b]) => `${a} -> ${b}`),
        extraNodes: [],
        warnings: [error instanceof Error ? error.message : String(error)],
      });
    }

    const result = results[results.length - 1];
    console.log(`\n=== ${String(index + 1).padStart(2, '0')} ${result.id} === ${result.pass ? 'PASS' : 'FAIL'}`);
    console.log(`category      ${result.category}`);
    console.log(
      `input kind    ${result.actualKind} (${percent(result.kindConfidence)}) · expected ${result.expectedKind} ${testCase.skipClassification ? '(not scored)' : result.kindOk ? '✓' : '✗'}`,
    );
    console.log(
      `nodes         recall ${percent(result.nodeRecall)} · precision ${percent(result.nodePrecision)} · ${result.nodeCount} actual / ${testCase.expected.nodes.length} expected`,
    );
    console.log(
      `decisions     ${percent(result.decisionRecall)} · branches ${percent(result.branchRecall)} · edges ${percent(result.edgeRecall)}`,
    );
    console.log(
      `cycles        ${result.cycleOk ? '✓' : '✗'} · quality ${percent(result.quality)} · ${result.edgeCount} connections`,
    );
    if (result.missingNodes.length > 0) console.log(`missing       ${result.missingNodes.join(' | ')}`);
    if (result.missingDecisions.length > 0) console.log(`decisions ✗   ${result.missingDecisions.join(' | ')}`);
    if (result.missingBranches.length > 0) console.log(`branches ✗    ${result.missingBranches.join(' | ')}`);
    if (result.missingEdges.length > 0) console.log(`relations ✗   ${result.missingEdges.join(' | ')}`);
    if (result.extraNodes.length > 0) console.log(`extra         ${result.extraNodes.slice(0, 6).join(' | ')}`);
    if (result.warnings.length > 0) console.log(`warnings      ${result.warnings.join(' ')}`);
  }

  const scoredKinds = results.filter((_, index) => !EVAL_CASES[index].skipClassification);
  const aggregate = {
    cases: results.length,
    passed: results.filter((result) => result.pass).length,
    passRate: results.filter((result) => result.pass).length / results.length,
    classificationAccuracy:
      scoredKinds.filter((result) => result.kindOk).length / Math.max(1, scoredKinds.length),
    avgNodeRecall: average(results.map((result) => result.nodeRecall)),
    avgNodePrecision: average(results.map((result) => result.nodePrecision)),
    avgDecisionRecall: average(results.map((result) => result.decisionRecall)),
    avgBranchRecall: average(results.map((result) => result.branchRecall)),
    avgEdgeRecall: average(results.map((result) => result.edgeRecall)),
    cycleAccuracy:
      results.filter((result) => result.cycleOk).length / Math.max(1, results.length),
    avgQuality: average(results.map((result) => result.quality)),
  };

  console.log('\n=== Aggregate ===');
  console.log(`cases                ${aggregate.cases}`);
  console.log(`pass rate            ${aggregate.passed}/${aggregate.cases} (${percent(aggregate.passRate)})`);
  console.log(`classification       ${percent(aggregate.classificationAccuracy)} (top-1)`);
  console.log(`node recall          ${percent(aggregate.avgNodeRecall)}`);
  console.log(`node precision       ${percent(aggregate.avgNodePrecision)} (reference-based)`);
  console.log(`decision recall      ${percent(aggregate.avgDecisionRecall)}`);
  console.log(`branch-label recall  ${percent(aggregate.avgBranchRecall)}`);
  console.log(`relationship recall  ${percent(aggregate.avgEdgeRecall)}`);
  console.log(`cycle accuracy       ${percent(aggregate.cycleAccuracy)}`);
  console.log(`avg graph quality    ${percent(aggregate.avgQuality)}`);
  console.log(
    '\nNote: metrics are measured against semantic reference graphs on the local deterministic engine. They are not a claim of universal 100% accuracy.',
  );

  if (aggregate.passRate < 1) {
    process.exitCode = 1;
  }
}

void main();
