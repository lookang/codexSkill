# Interactive xAPI Designer privacy policy

Publisher: **lookang (Lawrence Wee)**. Last updated: **5 October 2026**.

This policy describes the Interactive xAPI Designer plugin and the learning activities it helps users create. The publisher's source and support channel are at [lookang/codexSkill](https://github.com/lookang/codexSkill).

## Plugin inputs and processing

The plugin supplies skills, instructions, scripts and a verified reference package for creating or integrating educational HTML/ZIP activities. It does not include a publisher-operated MCP server or a separate publisher-operated service for storing conversations, uploaded activities or student records.

When you use it in ChatGPT or Codex, your prompts, uploaded files and generated outputs are processed in that environment. OpenAI's applicable policies, your account settings and any organisation controls govern that processing and retention. This plugin does not provide separate controls for deleting your OpenAI conversations or files.

The plugin may use tools you authorise, such as file storage or a connected source repository, to complete a requested task. Those services process the information sent to them under their own policies. The plugin's default workflow integrates files locally; it does not require uploading your activity to the public SLS xAPI Integrator service. Such an upload should occur only when you authorise it. Its bundled transport-preparation helper uses local, hash-pinned reference files and makes no network request. ZIP inspection helpers enforce path, link, entry-count and decompressed-size limits before extracting into a private staging directory.

## Data in generated learning activities

An integrated activity can record checked responses, correctness and marks, first and latest answers, revisions, existing optional confidence, hints or worked-solution use, elapsed time, and relevant committed simulation settings and model results. The evidence depends on the activity and the authorised integration. A slider value alone is not treated as proof of learning achievement.

When launched in SLS or another configured learning platform, the unchanged xAPI transport can send learning state and statements to the learning record endpoint supplied by that platform. Standard xAPI statements may include the learner identity supplied by the platform. The plugin instructs authors not to invent identities, copy launch credentials into diagnostic reports, or collect raw keystrokes or unrelated browser data. Local browser and mock-LRS checks should use synthetic data and an unauthenticated isolated browser context; live SLS checks require an explicit user request.

Some generated activities and the reference transport use browser storage for launch configuration, cached state or restoration. This may include platform-supplied launch settings and learning responses. Browser storage can persist beyond closing the activity. Clearing the relevant site's browser storage removes local copies; it does not delete records already held by SLS or another learning record store.

SLS ZIP packages produced by the plugin include `IWANT2STUDY-METADATA.txt` and `IWANT2STUDY-METADATA.json`. These files can contain the activity-specific prompt or brief supplied for the work, a concise implementation-iteration log, the authoring platform and model/effort labels when reported, packaged-file hashes and verification notes. They are stored inside the ZIP and are not sent to SLS by the packaging helper. Authors should review them before sharing. The plugin excludes hidden model reasoning, learner identities and responses, launch credentials and unrelated conversation from this provenance record. If ChatGPT, Codex or Claude Code does not expose an exact model or effort setting, the metadata records `not-reported` rather than inferring it.

## Retention and control

The teacher, school or platform operator determines deployment, access, the learning record destination, and retention of records held by the learning platform. Consult that institution or platform about access, correction or deletion of learner records. The publisher cannot delete records from a school's SLS instance or another operator's learning record store through this plugin.

Authors should inspect generated code and its analytics before deploying it, collect only evidence needed for the learning purpose, and use synthetic data for development and testing. Do not include private credentials or real student records in a public plugin package, public repository, demonstration or support issue.

## Public pages and support

GitHub hosts this policy and the public source repository. Access to those pages is subject to GitHub's own service and privacy policies.

For a plugin privacy or implementation question, use the publisher's [support issues](https://github.com/lookang/codexSkill/issues). Do not post student records, authentication values or other sensitive information in a public issue. For concerns about data held by OpenAI or your learning platform, contact that provider or your institution directly.

This policy may be updated when the plugin's data handling changes. The date above identifies the current published policy.
