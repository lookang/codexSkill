import process from "node:process";
import { parseArgs } from "../src/cli.mjs";
import { applyTargetUrl, loadConfig, mergeDefaults } from "../src/io.mjs";
import { runSlsWorkflow } from "../src/sls-runner.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  const config = applyTargetUrl(
    mergeDefaults(await loadConfig(options.configPath)),
    options
  );
  const result = await runSlsWorkflow(config, options);
  console.log(`\nSLS ${options.mode} run completed.`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Trace:  ${result.tracePath}`);
  if (result.checkpointPath) console.log(`State:  ${result.checkpointPath}`);
} catch (error) {
  console.error(`\nSLS run stopped: ${error.message}`);
  if (error.cause) console.error(`Cause: ${error.cause.message}`);
  process.exitCode = 1;
}
