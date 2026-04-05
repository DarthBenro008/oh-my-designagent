export const CONTEXT_SEPARATOR = "---SEPARATOR---";

const JOINER = ` && echo "${CONTEXT_SEPARATOR}" && `;

function joinCommands(commands: string[]): string {
  return commands.join(JOINER);
}

function statusCommand(): string {
  return "figma-daemon status";
}

function nodeTreeCommand(nodeId: string): string {
  return `figma-daemon node tree ${nodeId} --depth 3`;
}

function patchNodeTreeCommand(nodeId: string): string {
  return `figma-daemon node tree ${nodeId} --depth 2`;
}

function exportJsxCommand(nodeId: string): string {
  return `figma-daemon export jsx ${nodeId} --pretty`;
}

function nodeBindingsCommand(nodeId: string): string {
  return `figma-daemon node bindings ${nodeId}`;
}

function exportNodeCommand(nodeId: string, outputPath: string): string {
  return `figma-daemon export node ${nodeId} --output ${outputPath}`;
}

function commentListCommand(): string {
  return "figma-daemon comment list --json";
}

function analyzeColorsCommand(): string {
  return "figma-daemon analyze colors";
}

function analyzeTypographyCommand(): string {
  return "figma-daemon analyze typography";
}

function pageBoundsCommand(): string {
  return "figma-daemon page bounds";
}

function variableFindCommand(): string {
  return 'figma-daemon variable find ""';
}

function lintCommand(nodeId: string): string {
  return `figma-daemon lint --root ${nodeId} -v`;
}

export function buildContextGatherCommand(nodeId: string | undefined): string {
  const commands = nodeId
    ? [
        statusCommand(),
        nodeTreeCommand(nodeId),
        exportJsxCommand(nodeId),
        nodeBindingsCommand(nodeId),
        exportNodeCommand(nodeId, "/tmp/before.png"),
      ]
    : [statusCommand(), commentListCommand()];

  return joinCommands(commands);
}

export function buildPatchContextCommand(nodeId: string): string {
  return joinCommands([
    statusCommand(),
    patchNodeTreeCommand(nodeId),
    exportJsxCommand(nodeId),
    nodeBindingsCommand(nodeId),
  ]);
}

export function buildCreationContextCommand(
  nodeId: string | undefined,
): string {
  const commands = nodeId
    ? [buildContextGatherCommand(nodeId)]
    : [statusCommand()];

  commands.push(
    analyzeColorsCommand(),
    analyzeTypographyCommand(),
    pageBoundsCommand(),
    variableFindCommand(),
  );

  return joinCommands(commands);
}

export function buildPostRenderCommand(nodeId: string): string {
  return joinCommands([
    exportNodeCommand(nodeId, "/tmp/after.png"),
    lintCommand(nodeId),
    nodeBindingsCommand(nodeId),
  ]);
}
