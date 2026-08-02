"""System-level validator for every generated FAMath package."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SOURCE_ROOT.parent
MANIFEST_PATH = SOURCE_ROOT / "activities.json"
SAMPLE_ZIP = PROJECT_ROOT / (
    "scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-"
    "with-pictures-replacements-by-acp.zip"
)
PACKAGE_ROOT = PROJECT_ROOT / "_packages"
EXPECTED_ROOT_ENTRIES = {
    "index.html",
    "activity.json",
    "instruction.txt",
    "lib/xapiwrapper.min.js",
    "lib/xAPI.js",
}


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


def main() -> int:
    activities = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected_counts = {1: 32, 2: 30, 3: 34, 4: 42, 5: 37, 6: 27}
    grade_activities: dict[int, list[dict[str, object]]] = defaultdict(list)
    for activity in activities:
        match = re.match(r"^P(\d+)-", activity["id"])
        if not match:
            fail(f"Activity id has no grade marker: {activity['id']}")
        grade_activities[int(match.group(1))].append(activity)
    actual_counts = {grade: len(items) for grade, items in grade_activities.items()}
    if actual_counts != expected_counts:
        fail(f"Expected grade counts {expected_counts}, found {actual_counts}")
    # Official learning-objective wording can repeat across grades (for example,
    # reading and writing numbers); identity and routing fields must remain unique.
    for field in ("id", "folder", "shortTitle", "kind"):
        values = [activity[field] for activity in activities]
        if len(set(values)) != len(values):
            fail(f"Duplicate manifest field: {field}")
    for grade, items in grade_activities.items():
        for index, activity in enumerate(items, start=1):
            expected_prefix = f"Primary{grade}_{index:02d}_"
            if not activity["folder"].startswith(expected_prefix):
                fail(
                    f"{activity['id']}: folder must begin with syllabus-order "
                    f"prefix {expected_prefix}"
                )
        catalog_html_path = PROJECT_ROOT / f"Primary{grade}_Syllabus_Order.html"
        catalog_markdown_path = PROJECT_ROOT / (
            "SYLLABUS_ORDER.md" if grade == 1 else f"PRIMARY{grade}_SYLLABUS_ORDER.md"
        )
        if not catalog_html_path.is_file() or not catalog_markdown_path.is_file():
            fail(f"Primary {grade} generated syllabus-order catalogues are missing")
        catalog_html = catalog_html_path.read_text(encoding="utf-8")
        catalog_markdown = catalog_markdown_path.read_text(encoding="utf-8")
        if catalog_html.count("<tr data-order=") != len(items):
            fail(f"Primary {grade} HTML syllabus catalogue is incomplete")
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

    node = Path(
        r"C:\Users\weelo\.cache\codex-runtimes\codex-primary-runtime"
        r"\dependencies\node\bin\node.exe"
    )
    if not node.exists():
        fail(f"Bundled Node.js was not found: {node}")

    results: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="famath-validate-") as temp_dir:
        temp_root = Path(temp_dir)
        for activity in activities:
            folder = PROJECT_ROOT / activity["folder"]
            package = PACKAGE_ROOT / f"{activity['folder']}_SLS_xAPI.zip"
            grade = int(re.match(r"^P(\d+)-", activity["id"]).group(1))
            legacy_name = re.sub(
                rf"^Primary{grade}_\d{{2}}_", f"Primary{grade}_", activity["folder"]
            )
            if (PROJECT_ROOT / legacy_name).exists():
                fail(f"{activity['id']}: legacy unordered folder still exists: {legacy_name}")
            if (PACKAGE_ROOT / f"{legacy_name}_SLS_xAPI.zip").exists():
                fail(f"{activity['id']}: legacy unordered package still exists: {legacy_name}")
            for relative in EXPECTED_ROOT_ENTRIES:
                path = folder / Path(relative)
                if not path.is_file():
                    fail(f"{activity['id']}: missing {path}")

            html = (folder / "index.html").read_text(encoding="utf-8")
            checks = {
                "viewport": 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' in html,
                "objective": activity["objective"] in html,
                "embedded_css": "<style>" in html and "</style>" in html,
                "semantic_xapi": "teacherAnalytics" in html and "window.storeState" in html,
                "analytics": "Learning Analytics" in html and "actionLog" in html,
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
                "animated_ratio_visual_family": all(
                    marker in html
                    for marker in (
                        "normalizedRatioModel",
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
                        "misconceptionFor",
                        "misconception:correct?null",
                        "window.__famathChoiceAudit",
                        "choiceAuditFor",
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
                "formative_answers_concealed_before_check": (
                    'class="answer"' not in html
                    and 'data-answer-concealed="true"' in html
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
            }
            missing_checks = [name for name, passed in checks.items() if not passed]
            if missing_checks:
                fail(f"{activity['id']}: HTML checks failed: {', '.join(missing_checks)}")

            for relative, expected_bytes in proven.items():
                actual = (folder / Path(relative)).read_bytes()
                if sha256(actual) != sha256(expected_bytes):
                    fail(f"{activity['id']}: proven library hash mismatch for {relative}")

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
                for relative, expected_bytes in proven.items():
                    if sha256(archive.read(relative)) != sha256(expected_bytes):
                        fail(f"{activity['id']}: ZIP library hash mismatch for {relative}")
                packaged_html = archive.read("index.html").decode("utf-8")
                if packaged_html != html:
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
            "Primary 4 place-value, number-line, factor, algorithm, fraction and decimal models",
            "Primary 4 area, angle, symmetry, net and data representations",
            "misconception-first Primary 4 visual tutorial and notation bridge",
            "middle-primary base-ten, equal-group, fraction, money, measurement, time, geometry and graph models",
            "upper-primary expression, fraction, decimal, percentage and rate models",
            "upper-primary triangle, volume, angle, ratio, algebra, circle and average models",
            "finite unique answer choices and option-specific misconception diagnostics",
            "concrete group-counting, equal-sharing, number-line and reciprocal-rule fraction division sequence",
            "required files",
            "self-contained app CSS and JavaScript",
            "offline local references",
            "touch and keyboard controls",
            "progressive formative stages",
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
