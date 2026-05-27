export interface PendingDirectLoad {
  /** XML that was successfully loaded into Blockly and should be preserved. */
  blocksXml: string
  /** Block types we expect to remain present in later workspacesave echoes. */
  expectedBlockTypes: ReadonlySet<string>
  /** Epoch ms deadline after which the watchdog gives up. */
  deadlineAt: number
  /** Number of reapply attempts performed so far. */
  attempts: number
  /**
   * When true, keep reapplying until deadline (ignore attempt cap).
   * Used for pluggable-consumer protection where PXT can clobber repeatedly.
   */
  protectPluggableConsumer: boolean
}
