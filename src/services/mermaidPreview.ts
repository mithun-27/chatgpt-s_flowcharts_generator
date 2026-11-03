let renderCounter = 0;

export async function renderMermaidSvg(code: string, dark: boolean): Promise<string> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 16,
    },
  });

  renderCounter += 1;
  const id = `mermaid-preview-${Date.now()}-${renderCounter}`;
  try {
    const result = await mermaid.render(id, code);
    return result.svg;
  } finally {
    document.getElementById(id)?.remove();
  }
}
