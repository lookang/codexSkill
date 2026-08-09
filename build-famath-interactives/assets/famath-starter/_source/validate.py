"""System-level validator for every generated FAMath package."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SOURCE_ROOT.parent
MANIFEST_PATH = SOURCE_ROOT / "activities.json"
SECONDARY_MANIFEST_PATH = SOURCE_ROOT / "secondary_syllabus.json"
SAMPLE_ZIP = PROJECT_ROOT / (
    "scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-"
    "with-pictures-replacements-by-acp.zip"
)
PACKAGE_ROOT = PROJECT_ROOT / "_packages"
KATEX_VENDOR_ROOT = SOURCE_ROOT / "vendor" / "katex"
EXPECTED_ROOT_ENTRIES = {
    "index.html",
    "activity.json",
    "instruction.txt",
    "lib/xapiwrapper.min.js",
    "lib/xAPI.js",
}
KATEX_PACKAGE_ENTRIES = {
    f"lib/katex/{path.relative_to(KATEX_VENDOR_ROOT).as_posix()}"
    for path in KATEX_VENDOR_ROOT.rglob("*")
    if path.is_file()
}
EXPECTED_ROOT_ENTRIES.update(KATEX_PACKAGE_ENTRIES)
THREE_CLASSIC_ENTRY = "lib/three.r150.classic.js"
THREE_PRIMARY_KINDS = {
    "p2_3d_shapes", "p4_solid_representations", "p4_draw_solid_representations",
    "p4_identify_nets", "p4_net_to_solid", "p5_unit_cube_build", "p5_cubic_units",
    "p5_isometric_drawing", "p5_volume_formula", "p5_tank_volume", "p5_liquid_cm3",
    "p6_cuboid_missing_dimension", "p6_cube_edge", "p6_cuboid_height", "p6_face_area",
}


def uses_three(activity: dict[str, object]) -> bool:
    if activity["kind"] in THREE_PRIMARY_KINDS:
        return True
    if not str(activity["id"]).startswith("S"):
        return False
    objective = str(activity["objective"]).lower()
    return any(
        phrase in objective
        for phrase in (
            "volume and surface area of prism and cylinder",
            "volume and surface area of composite solids",
            "volume and surface area of pyramid, cone and sphere",
            "ratio of volumes of similar solids",
        )
    )


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fail(message: str) -> None:
    raise AssertionError(message)


def extract_inline_app_js(html: str) -> str:
    scripts = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", html, re.S | re.I)
    scripts = [script for script in scripts if script.strip()]
    if len(scripts) != 1:
        fail(f"Expected one inline application script, found {len(scripts)}")
    return scripts[0]


def folder_slug(value: str) -> str:
    replacements = {
        "≤": " less than or equal to ", "≥": " greater than or equal to ",
        "×": " times ", "÷": " divided by ", "²": " squared ",
        "³": " cubed ", "ⁿ": " power n ", "−": " minus ", "π": " pi ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = "".join(
        character for character in unicodedata.normalize("NFD", value)
        if unicodedata.category(character) != "Mn" and ord(character) < 128
    )
    slug = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return slug[:78].rstrip("_")


def load_activities() -> list[dict[str, object]]:
    activities = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    syllabus = json.loads(SECONDARY_MANIFEST_PATH.read_text(encoding="utf-8"))
    for level in range(1, 6):
        records = syllabus["levels"][str(level)]
        if isinstance(records, str):
            records = syllabus[records]
        for order, (section_code, objective_code, objective_text, family) in enumerate(records, 1):
            strand, sub_strand = syllabus["sections"][section_code]
            activities.append(
                {
                    "id": f"S{level}-{section_code}-{objective_code}",
                    "folder": (
                        f"Secondary{level}_{order:02d}_{section_code}_{objective_code}_"
                        f"{folder_slug(objective_text)}"
                    ),
                    "strand": strand,
                    "subStrand": f"{section_code}. {sub_strand}",
                    "section": section_code,
                    "objective": f"{objective_code} {objective_text}",
                    "shortTitle": f"{section_code} {objective_code} · {objective_text}",
                    "kind": f"s{level}_{section_code.lower()}_{objective_code.replace('.', '_')}",
                    "family": family,
                    "grade": level,
                    "schoolStage": "Secondary",
                    "curriculumSource": syllabus["source"],
                }
            )
    return activities


def main() -> int:
    activities = load_activities()
    expected_counts = {
        "P": {1: 32, 2: 30, 3: 34, 4: 42, 5: 37, 6: 27},
        "S": {1: 51, 2: 38, 3: 43, 4: 43, 5: 20},
    }
    grade_activities: dict[tuple[str, int], list[dict[str, object]]] = defaultdict(list)
    for activity in activities:
        match = re.match(r"^([PS])(\d+)-", activity["id"])
        if not match:
            fail(f"Activity id has no grade marker: {activity['id']}")
        grade_activities[(match.group(1), int(match.group(2)))].append(activity)
    actual_counts = {
        stage: {
            grade: len(grade_activities[(stage, grade)])
            for grade in sorted(levels)
        }
        for stage, levels in expected_counts.items()
    }
    if actual_counts != expected_counts:
        fail(f"Expected grade counts {expected_counts}, found {actual_counts}")
    template_html = (SOURCE_ROOT / "index.template.html").read_text(encoding="utf-8")
    p6_kinds = {str(activity["kind"]) for activity in grade_activities[("P", 6)]}
    progression_match = re.search(
        r"const P6_LEVEL_2_PROGRESSIONS=Object\.freeze\(\{(.*?)\n\s*\}\);",
        template_html,
        re.S,
    )
    if not progression_match:
        fail("Primary 6 Level 2 progression contract is missing")
    progression_kinds = set(
        re.findall(r"^\s+(p6_[a-z0-9_]+):\{", progression_match.group(1), re.M)
    )
    if progression_kinds != p6_kinds:
        fail(
            "Primary 6 Level 2 progression contract mismatch: "
            f"missing={sorted(p6_kinds - progression_kinds)}, "
            f"extra={sorted(progression_kinds - p6_kinds)}"
        )
    if "numbers-only" in progression_match.group(1):
        fail("Primary 6 Level 2 must not use a numbers-only difficulty increase")
    # Official learning-objective wording can repeat across grades (for example,
    # reading and writing numbers); identity and routing fields must remain unique.
    for field in ("id", "folder", "kind"):
        values = [activity[field] for activity in activities]
        if len(set(values)) != len(values):
            fail(f"Duplicate manifest field: {field}")
    for (stage, grade), items in grade_activities.items():
        stage_name = "Primary" if stage == "P" else "Secondary"
        for index, activity in enumerate(items, start=1):
            expected_prefix = f"{stage_name}{grade}_{index:02d}_"
            if not activity["folder"].startswith(expected_prefix):
                fail(
                    f"{activity['id']}: folder must begin with syllabus-order "
                    f"prefix {expected_prefix}"
                )
        catalog_html_path = PROJECT_ROOT / f"{stage_name}{grade}_Syllabus_Order.html"
        catalog_markdown_path = PROJECT_ROOT / (
            "SYLLABUS_ORDER.md"
            if stage == "P" and grade == 1
            else f"{stage_name.upper()}{grade}_SYLLABUS_ORDER.md"
        )
        if not catalog_html_path.is_file() or not catalog_markdown_path.is_file():
            fail(f"{stage_name} {grade} generated syllabus-order catalogues are missing")
        catalog_html = catalog_html_path.read_text(encoding="utf-8")
        catalog_markdown = catalog_markdown_path.read_text(encoding="utf-8")
        if catalog_html.count("<tr data-order=") != len(items):
            fail(f"{stage_name} {grade} HTML syllabus catalogue is incomplete")
        for activity in items:
            if activity["folder"] not in catalog_html:
                fail(f"{activity['id']}: missing from HTML syllabus catalogue")
            if activity["folder"] not in catalog_markdown:
                fail(f"{activity['id']}: missing from Markdown syllabus catalogue")

    with zipfile.ZipFile(SAMPLE_ZIP) as sample:
        proven = {
            "lib/xapiwrapper.min.js": sample.read("lib/xapiwrapper.min.js"),
            "lib/xAPI.js": sample.read("lib/xAPI.js"),
        }

    if not KATEX_VENDOR_ROOT.is_dir():
        fail(f"Local KaTeX vendor folder is missing: {KATEX_VENDOR_ROOT}")
    if not KATEX_PACKAGE_ENTRIES:
        fail("Local KaTeX vendor folder contains no packageable files")
    katex_sources = {
        entry: (KATEX_VENDOR_ROOT / Path(entry).relative_to("lib/katex")).read_bytes()
        for entry in KATEX_PACKAGE_ENTRIES
    }
    katex_css = (KATEX_VENDOR_ROOT / "katex.min.css").read_text(encoding="utf-8")
    for reference in re.findall(r"url\(([^)]+)\)", katex_css):
        local_reference = reference.strip("'\"")
        if not (KATEX_VENDOR_ROOT / local_reference).is_file():
            fail(f"KaTeX stylesheet has an unresolved local asset: {local_reference}")

    node = Path(
        r"C:\Users\weelo\.cache\codex-runtimes\codex-primary-runtime"
        r"\dependencies\node\bin\node.exe"
    )
    if not node.exists():
        fail(f"Bundled Node.js was not found: {node}")

    results: list[dict[str, object]] = []
    three_runtime_hash: str | None = None
    with tempfile.TemporaryDirectory(prefix="famath-validate-") as temp_dir:
        temp_root = Path(temp_dir)
        for activity in activities:
            folder = PROJECT_ROOT / activity["folder"]
            package = PACKAGE_ROOT / f"{activity['folder']}_SLS_xAPI.zip"
            identity = re.match(r"^([PS])(\d+)-", activity["id"])
            stage, grade = identity.group(1), int(identity.group(2))
            stage_name = "Primary" if stage == "P" else "Secondary"
            legacy_name = re.sub(
                rf"^{stage_name}{grade}_\d{{2}}_", f"{stage_name}{grade}_", activity["folder"]
            )
            if (PROJECT_ROOT / legacy_name).exists():
                fail(f"{activity['id']}: legacy unordered folder still exists: {legacy_name}")
            if (PACKAGE_ROOT / f"{legacy_name}_SLS_xAPI.zip").exists():
                fail(f"{activity['id']}: legacy unordered package still exists: {legacy_name}")
            for relative in EXPECTED_ROOT_ENTRIES:
                path = folder / Path(relative)
                if not path.is_file():
                    fail(f"{activity['id']}: missing {path}")
            activity_uses_three = uses_three(activity)
            three_path = folder / THREE_CLASSIC_ENTRY
            if activity_uses_three and not three_path.is_file():
                fail(f"{activity['id']}: mapped 3D activity is missing {three_path}")
            if not activity_uses_three and three_path.exists():
                fail(f"{activity['id']}: non-3D activity contains unnecessary Three.js runtime")

            html_bytes = (folder / "index.html").read_bytes()
            html = html_bytes.decode("utf-8")
            checks = {
                "viewport": 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' in html,
                "objective": activity["objective"] in html or (
                    activity["objective"]
                    .replace("<", r"\u003c")
                    .replace(">", r"\u003e")
                    .replace("'", r"\u0027")
                    .replace("&", r"\u0026") in html
                ),
                "embedded_css": "<style>" in html and "</style>" in html,
                "semantic_xapi": "teacherAnalytics" in html and "window.storeState" in html,
                "analytics": "Learning Analytics" in html and "actionLog" in html,
                "complete_action_stream": all(
                    marker in html
                    for marker in (
                        "const fullActionLog=state.actions.map",
                        "Complete Action Log (chronological)",
                        "actionLogComplete:true",
                        "actionLogOrder:'chronological'",
                        "completeActionCount:state.actions.length",
                        "sequence:index+1",
                    )
                ) and all(
                    marker not in html
                    for marker in (
                        "recent.slice(-8)",
                        "state.actions.slice(-40)",
                        "state.actions.length>120",
                    )
                ),
                "progressive": "Guided" in html and "Supported" in html and "Independent" in html,
                "visual_tutorial": all(
                    marker in html
                    for marker in (
                        "Show me visually",
                        "tutorialDialog",
                        "tutorialSteps",
                        "tutorialEvidence",
                        "Now try it yourself",
                    )
                ),
                "primary4_visual_system": all(
                    marker in html
                    for marker in (
                        "makePrimary4Problem",
                        "p4ModelHTML",
                        "p4WorkedHTML",
                        "p4TutorialSteps",
                        "p4PlaceGridHTML",
                        "p4FractionBarsHTML",
                        "p4NetHTML",
                        "p4-number-line",
                        "p4-factor-board",
                        "p4-column",
                        "p4-fraction-row",
                        "p4-area-svg",
                        "p4-angle-svg",
                        "p4-sym-grid",
                        "p4-data-table",
                        "startsWith('p4_')",
                    )
                ),
                "upper_primary_visual_system": all(
                    marker in html
                    for marker in (
                        "makePrimary5Problem",
                        "makePrimary6Problem",
                        "upperSceneHTML",
                        "upperNumberWords",
                        "upperFraction",
                        "upperMixed",
                        "startsWith('p5_')",
                        "startsWith('p6_')",
                        "scene==='fraction'",
                        "scene==='percent'",
                        "scene==='ratio'",
                        "scene==='triangle'",
                        "scene==='volume'",
                        "scene==='angle'",
                        "scene==='algebra'",
                        "scene==='circle'",
                        "scene==='average'",
                        "upper-hundred-grid",
                        "upper-bar-model",
                        "upper-balance",
                        "upper-average-bars",
                    )
                ),
                "animated_average_visual_family": all(
                    marker in html
                    for marker in (
                        "averageSumHTML",
                        "averageCountHTML",
                        "averageShareHTML",
                        "averageFinalHTML",
                        "averageTutorialSteps",
                        'data-average-animation="combine"',
                        'data-average-animation="count"',
                        'data-average-animation="redistribute"',
                        'data-average-animation="check"',
                        "average-animation-replayed",
                        "average-value-inspected",
                        "average-equal-sharing",
                        "border-bottom:5px dashed var(--coral)",
                        "averageMode:mode",
                        "[3,6,11,12]",
                        "@media(prefers-reduced-motion:reduce)",
                    )
                ),
                "composite_angle_visual_family": all(
                    marker in html
                    for marker in (
                        "scene==='composite-angle'",
                        'data-composite-angle-model="question-synchronised"',
                        "scenarioIndex===0?'square-corner':'rectangle-corner'",
                        "variant='parallelogram'",
                        "variant='rhombus'",
                        "variant='trapezium'",
                        "variant='square-triangle'",
                        "A parallelogram has an interior angle",
                        "One interior angle of a rhombus",
                        "In the right trapezium shown",
                        "An isosceles triangle is joined to one side of a square",
                        "The visual angle size, named shape property and equation must agree",
                    )
                ),
                "secondary_visual_system": all(
                    marker in html
                    for marker in (
                        "makeSecondaryProblem",
                        "secondarySceneHTML",
                        "secondaryTutorialSteps",
                        "activateSecondaryInteractions",
                        "secondary-number-line",
                        "secondary-coordinate",
                        "secondary-geometry",
                        "secondary-matrix",
                        "secondary-flow-step",
                        "data-secondary-inspect",
                        "secondary-model-inspected",
                        "secondaryModelInspections",
                        "CONFIG.family",
                        "startsWith('s')",
                    )
                ),
                "animated_ratio_visual_family": all(
                    marker in html
                    for marker in (
                        "normalizedRatioModel",
                        "ratioRowColumns",
                        "ratioAnswerShape",
                        "ratioChoiceOptions",
                        "Ratio choices must share one response format",
                        "ratioStaticHTML",
                        "ratioOrderHTML",
                        "ratioCountAnimationHTML",
                        "ratioTransformationHTML",
                        "ratioNotationAnimationHTML",
                        "ratioTutorialSteps",
                        "data-ratio-animation",
                        "data-ratio-replay",
                        "data-ratio-label",
                        "ratio-animation-replayed",
                        "ratio-term-inspected",
                        "ratio-main-concealed",
                        "--ratio-columns",
                        "--ratio-unit-size:clamp(27px,4vw,45px)",
                        "data-precheck-model=\"ratio\"",
                        "q===1?[3,6,1]",
                        "mode:'equivalent'",
                        "mode:'divide'",
                        "kind==='p6_divide_ratio'?[`${secondShare} and ${firstShare}`",
                        "mode:'simplify'",
                        "mode:'find'",
                        "mode:'missing'",
                        "mode:'fraction'",
                    )
                ),
                "middle_primary_visual_system": all(
                    marker in html
                    for marker in (
                        "makePrimary2Problem",
                        "makePrimary3Problem",
                        "primarySceneHTML",
                        "startsWith('p2_')",
                        "startsWith('p3_')",
                        "scene==='base10'",
                        "scene==='groups'",
                        "scene==='money'",
                        "scene==='measure'",
                        "scene==='clock'",
                        "scene==='shape'",
                        "scene==='graph'",
                        "scene==='area'",
                        "scene==='lines'",
                        "scene==='timeline'",
                        "primary-base10",
                        "primary-money-board",
                        "primary-bar-chart",
                        "primary-area-grid",
                    )
                ),
                "choice_safety_and_diagnostics": all(
                    marker in html
                    for marker in (
                        "validOptionValue",
                        "optionFallbacks",
                        "problemHasValidChoices",
                        "Invalid generated problem choices",
                        "optionFeedback",
                        "placeValueChoiceDiagnosis",
                        "inferredChoiceDiagnosis",
                        "misconceptionFor",
                        "misconceptionCode:diagnosis?diagnosis.code:null",
                        "Teacher feedback for this choice",
                        "window.__famathChoiceAudit",
                        "choiceAuditFor",
                        "diagnosedWrongOptions",
                        "selectionSpecificFeedback",
                        "dataset.choiceAudit",
                        "answerPresent",
                    )
                ),
                "fraction_division_concrete_pictorial_abstract": all(
                    marker in html
                    for marker in (
                        "fractionDivisionTutorialSteps",
                        "fractionDivisionStoryHTML",
                        "fractionWholesBoardHTML",
                        "fractionMeasureGroupsHTML",
                        "fractionNumberLineHTML",
                        "fractionShareRecipientsHTML",
                        "fractionRuleBridgeHTML",
                        "scene==='fraction-division'",
                        "data-fraction-group-lab",
                        "data-fraction-share-lab",
                        "fraction-group-count-completed",
                        "fraction-equal-sharing-completed",
                        "mode:'measure'",
                        "mode:'share'",
                        "data-precheck-model=\"fraction-division\"",
                        "data-answer-concealed=\"true\"",
                        "Meaning first → rule second",
                    )
                ),
                "adaptive_difficulty_ladder": all(
                    marker in html
                    for marker in (
                        "const MAX_STEP = TOTAL_QUESTIONS - 1;",
                        "function clampStep(value)",
                        "function stepFor(slot)",
                        "function phaseForSlot(slot)",
                        "function adaptiveMoveFor(slot)",
                        "function advanceAdaptiveStep(slot)",
                        "function makeLadderProblems()",
                        "function makeProblemAtStep(step,slot)",
                        "function problemDifficultyScore(problem)",
                        "function problemSignature(problem)",
                        "const CANDIDATE_DRAWS=10;",
                        "function rankedPick(pool,step)",
                        "function stepBand(list,q,minSize=2)",
                        "function stepPick(list,q,minSize=2)",
                        "function stepRand(lo,hi,q)",
                        "function ensureProblemForSlot(slot)",
                        "function startAdaptiveSession(prebuiltLadder)",
                        "window.__famathLadderProblems",
                        "ADAPTIVE_MOVES",
                        "ADAPTIVE_STEP_NOTES",
                        "function renderAdaptiveMeter",
                        "function adaptivePath()",
                        "adaptiveDifficulty:true",
                        "adaptiveDifficultyPath:adaptivePath()",
                        "difficultyStep:currentStep()+1",
                        'id="adaptiveMeter"',
                        'id="adaptiveDots"',
                        'id="adaptiveNote"',
                        "noteSupportUsed()",
                        "window.__famathAdaptive=",
                        "famathTest=1",
                        # Changing challenge level must add to the record, never zero it.
                        "function archiveCurrentRun(reason)",
                        "function beginRun(level,reason)",
                        "function allRuns()",
                        "function bestScore()",
                        "runs:state.runs",
                        "levelRuns:allRuns()",
                        # Response evidence must span every attempt, not just the current run.
                        "function allResponses()",
                        # Prime factorisation shows the search, rejected primes included.
                        "function primeFactorTrial(n)",
                        "function primeFactorWalkHTML(n,{stage='search',caption=''}={})",
                        "function primeFactorPairHTML(a,b,{stage='search'}={})",
                        "function activatePrimeWalks(root=document)",
                        "does not divide",
                        "primeWalk:item[0]",
                        "primeWalkPair:[item[0],item[1]]",
                        "data-prime-walk-replay",
                        # A net the learner folds face by face, not a finished solid beside it.
                        "function netFoldLayout(solid)",
                        "function pyramidFoldAngle(base,apexHeight)",
                        "shape==='net-fold'",
                        "data-three-fold",
                        "function foldNext()",
                        "function unfoldAll()",
                        "userData.foldHinge",
                        # The spin and the fold must live on separate nested groups: Three.js Euler
                        # order is XYZ, so setting both on one object folds about the parent axis.
                        "const hinge=new T.Group(),pivot=new T.Group();",
                        "parent.pivot.add(hinge);",
                        "pivot.rotation.x=-fold.current*Math.PI/180;",
                        # Centring content in a container that can clip or scroll it pushes the overflow
                        # above the top edge, where scrollTop cannot reach. Safe centring falls back to
                        # start exactly when the content overflows.
                        "align-items:safe center",
                        "justify-content:safe center",
                        "place-items:safe center",
                        "const responses=allResponses()",
                        "responses:allResponses().slice(-160)",
                        "misconceptionEvidence:sessionWrong",
                        "level-tag",
                        "score:bestScore()",
                        'id="runLog"',
                        "steps:state.steps",
                        "support:state.support",
                    )
                )
                and "els.phase.textContent=phaseFor(state.q)" not in html,
                "generic_think_level_from_diagnosed_misconceptions": all(
                    marker in html
                    for marker in (
                        "THINK_MISTAKE_PHRASES",
                        "function thinkMistakePhrase(base,wrongValue)",
                        "function genericThinkProblem(kind,q)",
                        "function thinkPromptNamesValue(text,value)",
                        "function genericThinkAuditFor(problems)",
                        "window.__famathThinkAudit",
                        "Invalid generic Think item",
                        "function thinkSupported()",
                        "function availableLevels()",
                        "extensionType:'judge-the-reasoning'",
                        "thinkBase:base",
                        "if(p&&p.thinkBase)",
                        "asksForAWrongAnswer",
                        "correctAnswerOffered",
                        "answerNotNamedInPrompt",
                        ".repr-toggle[hidden] { display:none; }",
                        "#tutorialVisual .fraction-pie-board > .fraction-whole-wrap",
                    )
                )
                # A panel toggled through the hidden property must not carry an author display rule that
                # defeats it — that is what left a dead level picker on every non-Primary-6 activity.
                and ".level-picker[hidden]" in html,
                "primary6_challenge_levels_two_and_three": all(
                    marker in html
                    for marker in (
                        "function p6Level(kind,q,level)",
                        "challengeLevel:level",
                        "P6_LEVEL_2_PROGRESSIONS",
                        "p6DifficultyProfile",
                        "difficultyProfile:p6DifficultyProfile(kind,level)",
                        "progressionProfile",
                        "reasoningStructure",
                        "levelContrast",
                        "p6ChallengeAuditFor",
                        "window.__famathChallengeAudit",
                        "window.__famathDifficultyAudit",
                        "Invalid Primary 6 challenge scaffold",
                        "derive-recipient-count",
                        "derive-dividend-then-measure",
                        "percentage-point-change",
                        "derive-then-compare",
                        "half-full-capacity",
                        "update-an-average",
                        "unknown==='dividend'",
                        "unknown==='divisor'",
                        "challengeMode:'diameter-to-measure'",
                        "challengeMode:'diameter-to-part-perimeter'",
                        "challengeMode:'circumference-to-area'",
                        "challengeMode:'semicircle-area-to-radius'",
                        "compositeVariant:'square-minus-quarter'",
                        "compositeVariant:'square-quarter-adjustment'",
                        "averageMode:'find-missing'",
                        "mode:'find-missing'",
                        "mode:'difference'",
                        "mode:'not-equivalent'",
                        "mode:'fraction-to-ratio'",
                        "mode:'total-from-one'",
                    )
                ),
                "formative_answers_concealed_before_check": (
                    'class="answer"' not in html
                    and 'data-answer-concealed="true"' in html
                ),
                "precheck_solution_flow_concealment": all(
                    marker in html
                    for marker in (
                        "p4ModelHTML(p,{revealSolution=false}={})",
                        "p4ModelHTML(p,{revealSolution:true})",
                        "data-solution-state=\"${d.revealSolution?'revealed':'concealed'}\"",
                        "const flow=d.revealSolution?(d.flow||[]):[]",
                        "d.showArea&&d.revealSolution",
                        "const flow=d.revealSolution?`<div class=\"upper-operation-flow\"",
                        "Equal-share level = ${d.revealSolution?avg:'?'}",
                        "d.concealFocus&&!d.revealSolution",
                        "unknownDimension",
                    )
                ),
                "computed_results_concealed_until_scaffold": all(
                    marker in html
                    for marker in (
                        "2026-08-07-per-level-attempt-records-v1",
                        "data-precheck-result=\"concealed\"",
                        "side==='right'&&d.maskRight&&!d.revealSolution?['?']:values",
                        "maskRight=['p6_expression_notation','p6_simplify_linear','p6_substitution'].includes(kind)",
                        "const result=d.revealSolution?",
                        "const written=d.revealSolution?",
                        "d.revealSolution?v*scale:'?'",
                        "d.revealSolution?`${total} square units`:'? square units'",
                        "d.concealTotalLabel&&!d.revealSolution?'?'",
                        "d.concealReading&&!d.revealSolution?'?'",
                        "const hidden=new Set(d.concealIndices||[])",
                        "d.concealJump?'?':jump",
                        "concealIndices:[2]",
                        "concealJump:true",
                        "Use the blocks to test each choice without displaying the completed number word.",
                        "title:'Build the number from its place values'",
                    )
                ),
                "unknown_letter_formative_family": all(
                    marker in html
                    for marker in (
                        "2026-08-07-per-level-attempt-records-v1",
                        "unknownLetterModelHTML",
                        "unknownLetterBridgeHTML",
                        "unknownEquationMapHTML",
                        "unknownLetterTutorialSteps",
                        "if(p.unknownLetter)return unknownLetterTutorialSteps(p)",
                        "letters=['n','p','k','m','q','r']",
                        "Which equation uses ${letter} to represent the unknown number?",
                        "what does ${letter} represent?",
                        "Why is a letter useful in ${equation}?",
                        "It holds the place of the unknown number.",
                        "Do not calculate its value.",
                        "Represent the unknown with the named letter, preserve the equation, then check.",
                        "This learning objective is about representing the unknown, not calculating its value.",
                        "It does not reveal the number.",
                    )
                ) and "Which letter can represent the unknown number?" not in html,
                "circle_radius_starts_at_centre": all(
                    marker in html
                    for marker in (
                        "data-circle-radius-model=\"centre-to-circumference\"",
                        "data-radius-start=\"centre\"",
                        "data-radius-end=\"circumference\"",
                        "data-circle-centre",
                        "circle-centre-ring",
                        "circle-centre-dot",
                        "radius: centre → circumference",
                        "Every radius starts at the centre",
                    )
                ),
                "circle_formula_substitution_ladder": all(
                    marker in html
                    for marker in (
                        "circleFormulaData",
                        "circleFormulaHTML",
                        "circleTutorialSteps",
                        "if(p.circleTutorial)return circleTutorialSteps(p)",
                        "data-circle-substitution-ladder",
                        "data-circle-formula-stage",
                        "Choose the formula that matches the question",
                        "Substitute π = 22/7 and r =",
                        "Simplify one operation at a time",
                        "Calculate and attach the correct unit",
                        "circleTutorial:{mode:circleMode,radius:r,answer}",
                    )
                ),
                "circle_boundary_term_association": all(
                    marker in html
                    for marker in (
                        "circleAssociatedExpressionHTML",
                        "circleBoundaryAssociationHTML",
                        "data-circle-boundary-association",
                        "data-visual-association-key",
                        "data-visual-association-part",
                        "tutorial-circle-boundary-associated",
                        "Linked formula term to visual component",
                        "Tap any coloured term or matching visual part",
                    )
                ),
                "targeted_visual_measure_association": all(
                    marker in html
                    for marker in (
                        "targetedMeasureData",
                        "targetedMeasureDiagramHTML",
                        "targetedMeasureTutorialSteps",
                        "if(p.measureAssociation)return targetedMeasureTutorialSteps(p)",
                        "data-targeted-visual",
                        "data-visual-association-family",
                        "visual-component-associated",
                        "tutorial-visual-component-associated",
                        "Matching parts will flash together",
                        "'rectangle-area'",
                        "type:'composite-area'",
                        "type:'triangle-area'",
                        "type:'parallelogram-area'",
                        "type:'trapezium-area'",
                    )
                ),
                "circle_area_region_association": all(
                    marker in html
                    for marker in (
                        "mode==='whole-area'",
                        "mode==='semi-area'",
                        "mode==='quarter-area'",
                        "mode==='composite-area'",
                        "mode==='composite-perimeter'",
                        "full circle reference",
                        "selected region",
                        "rectangle + purple semicircle",
                        "data-composite-circle-model=\"rectangle-semicircle\"",
                        "shared join is internal",
                        "Inspect the complete joined figure",
                    )
                ),
                "narrated_am_pm_day_journey": all(
                    marker in html
                    for marker in (
                        "amPmDayJourneyHTML",
                        "amPmRangeHTML",
                        "amPmDecisionHTML",
                        "amPmTutorialSteps",
                        "morningSituations",
                        "pmSituations",
                        "data-am-pm-day-journey",
                        "data-day-cycle-next",
                        "data-am-pm-decision",
                        "day-cycle-step",
                        "day-cycle-journey-completed",
                        "am-pm-decision-completed",
                        "12 midnight",
                        "6 am",
                        "12 noon",
                        "6 pm",
                        ".day-window",
                        ".day-celestial",
                    )
                ),
                "interactive_duration_quarter_walk": all(
                    marker in html
                    for marker in (
                        "durationQuarterHourWalkHTML",
                        "durationTutorialSteps",
                        "data-duration-quarter-walk",
                        "data-duration-step",
                        "duration-quarter-step",
                        "duration-quarter-walk-completed",
                        "Move +15 minutes",
                        ".duration-quarter-path",
                    )
                ),
                "time_abbreviation_inspector": all(
                    marker in html
                    for marker in (
                        "timeAbbreviationInspectorHTML",
                        "timeAbbreviationTutorialSteps",
                        "data-time-abbreviation-inspector",
                        "data-time-unit-part",
                        "time-unit-part-inspected",
                        "time-unit-inspection-completed",
                    )
                ),
                "narrated_clock_five_minute_walk": all(
                    marker in html
                    for marker in (
                        "clockFiveMinuteWalkHTML",
                        "tellTimeTutorialSteps",
                        "data-clock-five-minute-walk",
                        "data-clock-step-minute",
                        "clock-five-minute-step",
                        "clock-five-minute-walk-completed",
                        "clockFiveMinuteSteps",
                        "Each number around the clock adds 5 minutes",
                        "The hour is still",
                        ".clock-five-path",
                        ".clock-minute-focus",
                        "data-gate-next=\"true\"",
                    )
                ),
                "narrated_ruler_attention_scaffold": all(
                    marker in html
                    for marker in (
                        "rulerAttentionHTML",
                        "lengthMeasureTutorialSteps",
                        'data-ruler-attention="${esc(mode)}"',
                        'data-attention-pointer="${i}"',
                        "data-ruler-choice",
                        "ruler-pointer-correct",
                        "ruler-pointer-incorrect",
                        "ruler-attention-completed",
                        "rulerPointersCompleted",
                        "Start at 0. Zero is the starting mark",
                        "Which arrow lines up with the object's right end?",
                        'style="--tick-position:${i*10}%"',
                        ".attention-pointer",
                        "@keyframes attention-pointer-bob",
                        ".ruler-attention.counting .attention-pointer",
                        "prefers-reduced-motion:reduce",
                    )
                ) and "grid-template-columns:repeat(11,1fr)" not in html,
                "ruler_attention_family_reuse": all(
                    marker in html
                    for marker in (
                        "drawLineTutorialSteps",
                        "Mark 0 before drawing",
                        "Count to the requested endpoint",
                        "Draw between the two endpoint arrows",
                        "if(CONFIG.kind==='draw_line')",
                        "rulerAttentionHTML({length:p.target",
                        "CONFIG.kind==='cm_abbreviation'",
                    )
                ),
                "pedagogical_answer_visual": all(
                    marker in html
                    for marker in (
                        "tutorialAnswerHTML",
                        "tutorialConclusionText",
                        "data-answer-visual",
                        "ordinalRaceHTML",
                        "sequenceJumpHTML",
                        "sequenceChange",
                        "jumpArrowHTML",
                        'orient="auto"',
                        'marker-end="url(#${markerId})"',
                        "neighbour-checks",
                        "Check from both neighbours",
                        "orderInfo",
                        "magnitudeBarsHTML",
                        "orderMoveHTML",
                        "data-order-model",
                        "Give every ${subject} in your answer a visible size",
                        "Check the common mix-up",
                        "isPlaceValueOperation",
                        "representation:'hto'",
                        "p.representation==='hto'",
                        "else if(q===2){ a=35; b=11; }",
                        "htoBoardHTML",
                        "htoSubtractionSteps",
                        "htoAdditionSteps",
                        "htoMotionHTML",
                        'data-hto-regrouping="true"',
                        'data-exchange-motion="${esc(motion)}"',
                        "ones-gather-to-ten",
                        "hto-join-arrive",
                        "ten-travel-to-ones",
                        "hundred-travel-to-tens",
                        "exchange-result-appear",
                        "@media (prefers-reduced-motion:reduce)",
                        "Rename 1 hundred as 10 tens",
                        "Rename 1 ten as 10 ones",
                        "Rename 10 ones as 1 ten",
                        "steps.length",
                    )
                ),
                "no_bare_answer_fallback": (
                    "Now explain what the visual shows" not in html
                ),
                "dynamic_touch_tutorial": all(
                    marker in html
                    for marker in (
                        "interactiveCountHTML",
                        "countableTutorialData",
                        "ordinalTouchHTML",
                        "activateTutorialInteractions",
                        'data-tutorial-interaction="${mode}"',
                        "data-tutorial-count-item",
                        "data-gate-next",
                        "button.classList.add('counted')",
                        "tutorialInteractionEvidence",
                        "visualObjectsNumbered",
                        "touchModelsCompleted",
                    )
                ),
                "all_count_collection_phases_dynamic": all(
                    marker in html
                    for marker in (
                        "if(p.visual==='objects'){",
                        "numbering:'global'",
                        "Ten-group ${i+1}",
                        "data-count-numbering",
                        "data-count-purpose",
                        "touch-count-model.dense",
                    )
                ) and "p.visual==='objects'&&/^Touch each" not in html,
                "non_repetitive_counting_scaffold": all(
                    marker in html
                    for marker in (
                        "collectionGroupingHTML",
                        'data-collection-strategy="groups"',
                        'data-collection-strategy="place-value"',
                        'data-collection-strategy="count-on"',
                        "Touch and count once",
                        "Make useful groups of ten",
                        "Check by tens, then count on",
                        "No counter needs to be touched again.",
                    )
                ) and not re.search(
                    r"function tutorialCueHTML\(p,cue\)\{\s*const countable=",
                    html,
                ),
                "spoken_number_word_scaffold": all(
                    marker in html
                    for marker in (
                        "numberWordInfo",
                        "numberWordWholeHTML",
                        "numberWordPartsHTML",
                        "numberWordPlaceHTML",
                        "numberWordBridgeHTML",
                        "numberWordChoiceHTML",
                        "activateWordSpeech",
                        "speakNumberWord",
                        'data-speak-word=',
                        "heard-number-word",
                        "number-word-spoken",
                        "q===1?19",
                        "Tap the meaningful word parts",
                        "Build the value with tens and ones",
                        "teen means 1 ten",
                        "utterance.rate=.78",
                        "utterance.lang='en-SG'",
                    )
                ),
                "one_to_one_comparison_scaffold": all(
                    marker in html
                    for marker in (
                        "pairComparisonHTML",
                        "comparisonTournament",
                        "setComparisonTutorialSteps",
                        "pictureGraphComparisonTutorialSteps",
                        "data-pair-comparison",
                        ".pair-object.leftover",
                        "matched pairs",
                        "runs out first",
                        "has unmatched leftovers",
                        "comparisonMode:mode",
                        "graphMode:mode",
                        "@keyframes pair-arrive",
                        "@keyframes leftover-arrive",
                    )
                ),
                "optional_drag_interactions": all(
                    marker in html
                    for marker in (
                        "bindPointerDropSource",
                        "bindOrderDrag",
                        "bindMoneyDrag",
                        "bindLineDrag",
                        "bindGridPaintDrag",
                        "paintPath",
                        "data-drag-order",
                        "data-drag-money",
                        "data-money-drop",
                        "data-line-handle",
                        "data-grid-paint",
                        "drag-origin",
                        "drag-over",
                        "drag-ghost",
                        "Choose either way",
                        "inputMode:'drag'",
                        "item-dragged",
                        "money-dragged",
                        "line-endpoint-dragged",
                        "grid-drag-painted",
                        "dragActions",
                        "lastDragDestinations",
                    )
                ),
                "animated_mathematical_explanations": all(
                    marker in html
                    for marker in (
                        "motionShellHTML",
                        "orderingMotionHTML",
                        "storyMotionHTML",
                        "groupFormationMotionHTML",
                        "sharingMotionHTML",
                        "arrayFormationMotionHTML",
                        "durationMotionHTML",
                        "shapeAssemblyMotionHTML",
                        "gridCopyMotionHTML",
                        "pictureGraphMotionHTML",
                        'data-motion-kind="${esc(kind)}"',
                        "sequential-ordering",
                        "joining-story",
                        "separating-story",
                        "group-formation-",
                        "array-row-building",
                        "equal-sharing",
                        "elapsed-time",
                        "shape-composition",
                        "shape-decomposition",
                        "grid-cell-copying",
                        "picture-graph-row-building",
                        "Replay the movement",
                        "tutorial-animation-replayed",
                        "animation-replayed",
                        "One value moves at a time",
                        "The other bars stay visible",
                        "prefers-reduced-motion:reduce",
                    )
                ),
                "tangent_curve_arrowheads": (
                    all(
                        marker in html
                        for marker in (
                            'orient="auto"',
                            'marker-end="url(#${markerId})"',
                            'const markerId=`hto-arrow-${motion}`',
                            'marker-end="url(#${markerId})"></path>',
                            "'ones-to-ten':{d:",
                            "'ten-to-ones':{d:",
                            "'hundred-to-tens':{d:",
                            "'tens-to-hundred':{d:",
                        )
                    )
                    and '<polygon class="motion-arrowhead"' not in html
                    and "path.tip" not in html
                ),
                "interactive_mental_place_value_bonds": all(
                    marker in html
                    for marker in (
                        "mentalMode:mode===0?'within20':mode===1?'ones':'tens'",
                        "mentalCalculationTutorialSteps",
                        "String(p.display||'').match",
                        "mentalCalculationPlaceHTML",
                        "mentalNumberBondHTML",
                        "mentalChangeHTML",
                        "mentalRecombineHTML",
                        "data-mental-place-model",
                        "data-mental-part=\"tens\"",
                        "data-mental-part=\"ones\"",
                        "data-mental-number-bond",
                        "mental-place-part-inspected",
                        "mental-place-value-inspected",
                        "mentalPlacePartsInspected",
                        "mentalPlaceModelsCompleted",
                        "speakMathPhrase",
                        "Continue to the number bond",
                    )
                ),
                "interactive_money_cpa_tutorial": all(
                    marker in html
                    for marker in (
                        "moneyTutorialWalletHTML",
                        "q===0?15",
                        "moneyDecisionTrailHTML",
                        "moneyRunningTotalHTML",
                        "moneyAbstractHTML",
                        "moneyTutorialSteps",
                        "data-tutorial-money-lab",
                        "data-tutorial-money-value",
                        "data-drag-tutorial-money",
                        "data-tutorial-money-drop",
                        "tutorial-money-too-large",
                        "tutorial-money-tapped",
                        "tutorial-money-dragged",
                        "tutorial-money-completed",
                        "Crossed denominations are too large",
                        "largest denomination that does not exceed",
                        "tutorialMoneyAdded",
                        "tutorialMoneyRejected",
                        "tutorialMoneyCompleted",
                    )
                ),
                "interactive_story_actions": all(
                    marker in html
                    for marker in (
                        "storyActionHTML",
                        'data-story-action="${action}"',
                        "data-story-action-item",
                        "story-action-count",
                        "taken-away",
                        "story-object-removed",
                        "story-object-joined",
                        "story-removal-completed",
                        "story-joining-completed",
                        "Tap each coral-ringed object",
                        "nextButton.disabled=!complete",
                        "story-action-reset",
                        "storyObjectsRemoved",
                        "storyObjectsJoined",
                        "storyActionCompletions",
                        "storyActionResets",
                        "@keyframes story-take-away",
                    )
                ),
                "learner_error_first_scaffold": all(
                    marker in html
                    for marker in (
                        "captureLearnerAttempt",
                        "learnerAttemptFor",
                        "learnerAttemptHTML",
                        "learnerAttemptStep",
                        "withLearnerAttempt",
                        "learnerOrderAttemptHTML",
                        "learnerOrderValues",
                        "Your submitted answer",
                        "Your submitted order",
                        "Start with your answer",
                        "Start with your submitted order",
                        "data-learner-attempt",
                        "data-learner-order-position",
                        "learner-error-represented",
                        "tutorial-learner-error-represented",
                        "Represented learner answer first",
                        "orderingMotionHTML(p,startingValues)",
                    )
                ),
                "touch": "touchstart" in html and "touchend" in html,
                "keyboard_native": "<button" in html,
                "offline": not re.search(r"""(?:src|href)=["']https?://""", html, re.I),
                "local_latex_rendering": all(
                    marker in html
                    for marker in (
                        'href="./lib/katex/katex.min.css"',
                        'src="./lib/katex/katex.min.js"',
                        "function mathHTML(",
                        "function equationHTML(",
                        "function typesetMath(",
                        "data-math-tex",
                        "output:'htmlAndMathml'",
                        "promptHTML",
                        "latexTokens",
                        "bridgeTex",
                        "p4Root.rootTex",
                    )
                ),
                "responsive_inline_worked_steps": all(
                    marker in html
                    for marker in (
                        "data-inline-process-strip=\"true\"",
                        "--p4-step-count",
                        "grid-template-columns:repeat(var(--p4-step-count),minmax(0,1fr))",
                        ".p4-worked{grid-template-columns:repeat(2,minmax(0,1fr))}",
                        "data-step-number",
                    )
                ),
                "three_template_contract": all(
                    marker in html
                    for marker in (
                        "threeModelHTML", "activateThreeModels", "data-famath-three",
                        "data-three-action", "data-three-part", "three-d-part-inspected",
                        "three-d-model-rotated", "three-d-turn-replayed",
                        "webglcontextlost", "prefers-reduced-motion", "2D fallback drawing",
                        "data-three-label-layer", "famath-three-dimension-label",
                        "labels follow the object", "buildLabels",
                        "unknownParts=new Set",
                        "width,height,face",
                        "data-three-focus-face",
                        "face area ${isUnknown('face')||faceArea===undefined?'?'",
                        "The highlighted face area is unknown",
                        "new T.CylinderGeometry(radius,radius,distance,12)",
                        "button[data-three-part=\"length\"]",
                        "button[data-three-part=\"width\"]",
                        "button[data-three-part=\"height\"]",
                        ".upper-geo-svg .volume-dimension",
                        "height:clamp(210px,24vw,280px)",
                        "body.three-activity-active",
                        "max-height:900px",
                        ".secondary-geometry:has(.famath-three)",
                        ".secondary-scene:has(.famath-three) .famath-three-stage{height:160px}",
                        "Trace the joined faces of this net",
                        "A flat net whose solid is for the learner to identify",
                    )
                ),
                "three_runtime_routed": (
                    ('src="./lib/three.r150.classic.js"' in html) == activity_uses_three
                ),
            }
            missing_checks = [name for name, passed in checks.items() if not passed]
            if missing_checks:
                fail(f"{activity['id']}: HTML checks failed: {', '.join(missing_checks)}")

            for relative, expected_bytes in proven.items():
                actual = (folder / Path(relative)).read_bytes()
                if sha256(actual) != sha256(expected_bytes):
                    fail(f"{activity['id']}: proven library hash mismatch for {relative}")
            for relative, expected_bytes in katex_sources.items():
                actual = (folder / Path(relative)).read_bytes()
                if sha256(actual) != sha256(expected_bytes):
                    fail(f"{activity['id']}: local KaTeX asset mismatch for {relative}")
            if activity_uses_three:
                runtime_bytes = three_path.read_bytes()
                runtime_text = runtime_bytes.decode("utf-8")
                if "window.THREE = {" not in runtime_text or "REVISION = '150'" not in runtime_text:
                    fail(f"{activity['id']}: local Three.js runtime contract is invalid")
                current_hash = sha256(runtime_bytes)
                if three_runtime_hash is None:
                    three_runtime_hash = current_hash
                elif current_hash != three_runtime_hash:
                    fail(f"{activity['id']}: local Three.js runtime differs across 3D activities")

            inline_js = extract_inline_app_js(html)
            js_path = temp_root / f"{activity['id'].replace('.', '_')}.js"
            js_path.write_text(inline_js, encoding="utf-8")
            checked = subprocess.run(
                [str(node), "--check", str(js_path)],
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=False,
            )
            if checked.returncode != 0:
                fail(f"{activity['id']}: JavaScript syntax failed:\n{checked.stderr}")

            if not package.is_file():
                fail(f"{activity['id']}: missing SLS package {package}")
            with zipfile.ZipFile(package) as archive:
                names = archive.namelist()
                if any("\\" in name for name in names):
                    fail(f"{activity['id']}: ZIP contains Windows backslash entries")
                if not EXPECTED_ROOT_ENTRIES.issubset(names):
                    fail(f"{activity['id']}: ZIP is missing expected root entries")
                if activity_uses_three and THREE_CLASSIC_ENTRY not in names:
                    fail(f"{activity['id']}: 3D ZIP is missing the local Three.js runtime")
                if not activity_uses_three and THREE_CLASSIC_ENTRY in names:
                    fail(f"{activity['id']}: non-3D ZIP contains unnecessary Three.js runtime")
                if activity_uses_three and sha256(archive.read(THREE_CLASSIC_ENTRY)) != sha256(three_path.read_bytes()):
                    fail(f"{activity['id']}: packaged Three.js runtime differs from folder source")
                for relative, expected_bytes in proven.items():
                    if sha256(archive.read(relative)) != sha256(expected_bytes):
                        fail(f"{activity['id']}: ZIP library hash mismatch for {relative}")
                for relative, expected_bytes in katex_sources.items():
                    if sha256(archive.read(relative)) != sha256(expected_bytes):
                        fail(f"{activity['id']}: ZIP KaTeX asset mismatch for {relative}")
                packaged_html = archive.read("index.html")
                if packaged_html != html_bytes:
                    fail(f"{activity['id']}: packaged index.html differs from folder source")

            results.append(
                {
                    "id": activity["id"],
                    "folder": activity["folder"],
                    "kind": activity["kind"],
                    "packageBytes": package.stat().st_size,
                    "htmlBytes": (folder / "index.html").stat().st_size,
                    "syntax": "pass",
                    "zip": "pass",
                    "xapi": "pass",
                    "latex": "pass",
                    "threeD": "pass" if activity_uses_three else "not-applicable",
                }
            )

    report = {
        "status": "pass",
        "objectiveCount": len(activities),
        "packageCount": len(results),
        "sampleLibraryHashes": {
            name: sha256(data) for name, data in proven.items()
        },
        "checks": [
            "manifest uniqueness",
            "syllabus-order folder prefixes and legacy-name migration",
            "HTML and Markdown syllabus-order catalogues",
            "42 Primary 4 objectives in official pages 37-40 sequence",
            "30 Primary 2 objectives in official syllabus sequence",
            "34 Primary 3 objectives in official syllabus sequence",
            "37 Primary 5 objectives in official pages 41-42 sequence",
            "27 Primary 6 objectives in official pages 43-44 sequence",
            "51 Secondary 1 objectives in official syllabus order",
            "38 Secondary 2 objectives in official syllabus order",
            "43 Secondary 3 and 43 Secondary 4 objectives in the shared official syllabus block",
            "20 Secondary 5 objectives in official syllabus order",
            "fourteen reusable Secondary mathematical model families",
            "Secondary inspect-represent-transform-verify tutorials",
            "tappable and keyboard-operable Secondary model hotspots with spoken coaching",
            "animated Secondary transformations with reduced-motion completed states",
            "Secondary model-inspection evidence in teacher-visible xAPI analytics",
            "Primary 4 place-value, number-line, factor, algorithm, fraction and decimal models",
            "Primary 4 area, angle, symmetry, net and data representations",
            "misconception-first Primary 4 visual tutorial and notation bridge",
            "middle-primary base-ten, equal-group, fraction, money, measurement, time, geometry and graph models",
            "upper-primary expression, fraction, decimal, percentage and rate models",
            "upper-primary triangle, volume, angle, ratio, algebra, circle and average models",
            "animated Primary 6 average tutorials combine values, count data items, redistribute an unchanged total, and bridge to division notation",
            "question-synchronised square, rectangle, parallelogram, rhombus, trapezium and square-triangle composite-angle models",
            "whole-circle, semicircle and quarter-circle radii begin at explicit centres and end on their circumferences",
            "circle tutorials bridge the visual radius to formula, numerical substitution, simplification and final units in separate steps",
            "whole-circle, semicircle, quarter-circle and composite-area tutorials colour-link formula terms to clickable flashing regions",
            "semicircle, quarter-circle and composite-figure perimeter tutorials colour-link curved and straight formula terms to clickable flashing boundary parts",
            "composite circle activities retain the complete rectangle and semicircle, join equal 2r sides, and exclude the internal join from perimeter",
            "reusable targeted visual association scaffolds for rectangle, composite, triangle, parallelogram and trapezium measurement families",
            "colour-linked visual-component interaction evidence in teacher-visible xAPI analytics",
            "finite unique answer choices and selection-specific misconception diagnostics in visible feedback, tutorials and xAPI history",
            "computed solution flows concealed until check or guided remediation",
            "unknown-letter tasks vary letter names and assess representation rather than solving",
            "question-mark-to-letter bridge preserves operation and equality without disclosing a value",
            "concrete group-counting, equal-sharing, number-line and reciprocal-rule fraction division sequence",
            "all six Primary 6 questions at challenge levels 2 and 3 pass runtime family-scaffold audits",
            "inverse fraction tutorials begin from known shares or groups without assuming the unknown dividend or divisor",
            "inverse and composite circle challenges use question-faithful diagrams and derive unknown radii before formula substitution",
            "ratio, volume and missing-average challenge tutorials preserve their stated givens and complete the required reasoning",
            "required files",
            "self-contained app CSS and JavaScript",
            "offline local references",
            "local KaTeX runtime, stylesheet and WOFF2 fonts in every activity and SLS ZIP",
            "reusable LaTeX equation, prompt and tutorial rendering with accessible MathML output",
            "square-root and cube-root expressions rendered from LaTeX notation",
            "touch and keyboard controls",
            "offline local Three.js routing for mapped 3D families",
            "projected dimension labels attached to rotating solid geometry",
            "question-faithful multi-unknown 3D dimensions and highlighted perpendicular face areas",
            "thick blue length, purple width and red height associations in 3D and fallback drawings",
            "bounded 3D stage height and compact single-screen desktop layout",
            "semantic 3D inspection analytics and accessible 2D fallback",
            "flat-net pre-check concealment and post-check folded 3D model",
            "progressive formative stages",
            "responsive inline worked-step process strips on desktop with readable narrow-screen wrapping",
            "incorrect-answer visual tutorial",
            "concept-specific worked visual conclusions",
            "sequence jump arrows and two-sided neighbour checks",
            "sequence arrowheads automatically aligned to curve tangents",
            "H-T-O exchange arrowheads automatically aligned to all four curve tangents",
            "no manually positioned polygon heads on curved tutorial arrows",
            "backward-compatible sequence change inference",
            "five-stage tutorial pacing across every solver family",
            "proportional number-height and length-bar ordering models",
            "direction-first ordering with one-at-a-time placement",
            "hundreds-tens-ones concrete regrouping solver",
            "explicit H-T-O routing for every within-100 and column-method problem",
            "guaranteed non-regrouping 35 + 11 H-T-O checkpoint",
            "animated addend blocks joining matching H-T-O columns",
            "subtraction exchange from hundreds to tens to ones",
            "addition exchange from ones to tens to hundreds",
            "place-value blocks connected to the written algorithm",
            "click-to-hear tens and ones inspection before mental-calculation number bonds",
            "number-bond, affected-part and recombination scaffolds across all mental-calculation modes",
            "mental place-value interaction evidence included in teacher-visible xAPI analytics",
            "same-denomination tap-or-drag tutorial wallet for every cents and dollars problem",
            "stable 15-cent checkpoint for largest-fitting-denomination reasoning",
            "visible too-large, largest-fit, remaining-amount and running-total money reasoning",
            "concrete-pictorial-abstract money progression with tutorial interaction analytics",
            "animated equal-value exchanges between H-T-O columns",
            "repeating motion with reduced-motion static fallback",
            "dynamic one-to-one touch counting with visible number-off badges",
            "dynamic counting for Guided, Supported and Independent collections",
            "large collections arranged into globally numbered ten-groups",
            "one required full touch-count per collection tutorial",
            "non-repetitive ten-group, place-value and count-on consolidation",
            "generic later scaffold stages cannot recreate a live count model",
            "tappable number words and answer-choice pronunciation",
            "spoken whole-word and word-part support with slowed English speech",
            "number words connected to tens-and-ones place value",
            "regular teen words mapped to teen = 1 ten",
            "special handling for eleven, twelve, thirteen, fifteen and eighteen",
            "number-word speech interactions included in teacher analytics",
            "animated one-to-one pair matching for set comparison",
            "unmatched leftovers highlighted after equal pairs are removed",
            "most interpreted as the group with leftovers",
            "fewest interpreted as the group that runs out first",
            "three-set comparison handled as a visible comparison tournament",
            "picture-graph most and how-many-more questions reuse pairing evidence",
            "comparison animations include reduced-motion static fallback",
            "tap and pointer-drag alternatives for number and length ordering",
            "direct item-to-slot drops with independent box placement",
            "tap or drag-to-wallet alternatives for money totals",
            "step controls or draggable endpoint for line segments",
            "tap or drag-paint alternatives for copying grid figures",
            "drag gestures retain keyboard-accessible tap controls",
            "drag input mode and destination included in xAPI analytics",
            "sequential ordering motion keeps unselected values visible",
            "joining, separating, grouping, array and sharing motion models",
            "elapsed-time, shape, grid-copy and picture-graph motion models",
            "replayable animations recorded in teacher analytics and xAPI",
            "complete reduced-motion final states for every motion family",
            "clickable join and take-away story objects with sequential visual feedback",
            "cross-out and slow-dissolve removal with completion-gated tutorial progress",
            "story action and reset evidence in xAPI teacher analytics",
            "learner's submitted response reconstructed before remediation",
            "ordering correction begins from the submitted arrangement",
            "choice, construction, grid, line, money and ordinal error bridges",
            "learner-error representation included in xAPI teacher analytics",
            "counting-step completion gates and repeated-touch protection",
            "reusable touch models for sets, groups, arrays, sharing, graphs and ordinals",
            "touch-count interaction evidence in xAPI teacher analytics",
            "no bare-answer tutorial fallback",
            "semantic xAPI payload fields",
            "proven xAPI library hashes",
            "JavaScript syntax",
            "ZIP forward-slash paths",
            "ZIP source parity",
        ],
        "activities": results,
    }
    report_path = PROJECT_ROOT / "validation-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        f"PASS: {len(results)} activities, {len(results)} ZIPs, "
        "all syntax/package/xAPI checks passed."
    )
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
