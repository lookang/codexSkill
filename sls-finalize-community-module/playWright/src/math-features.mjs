// SLS renders mathematics as a WIRIS <img>: the src is a data-URI SVG whose only
// machine-readable form of the equation is an HTML comment, "<!--MathML: ...-->".
// The image contributes no text nodes, which is why a question that plainly reads
// "Solve 7x = 3x + 8" arrived as "Solve .". The page walker pulls that comment out
// and drops the raw MathML into the text; this flattens it back to the equation.
export function flattenMathml(text) {
  return String(text)
    .replace(/<math\b[^>]*>([\s\S]*?)<\/math>/gi, (_, inner) => {
      const symbols = [...inner.matchAll(/<(mn|mi|mo|mtext)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) =>
        m[2].replace(/<[^>]+>/g, "").trim()
      );
      // <msup> is the only structural tag worth keeping: "x squared" must not read
      // as "x2", which looks like a two-digit number rather than an index.
      const powered = /<msup\b/i.test(inner) ? `${symbols.join("")} ^` : symbols.join("");
      return ` ${powered} `;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Turns a question (or a syllabus outcome) into the mathematics it is about:
// which operations appear, on what kinds of number, and which named topic. Matching
// on these beats keyword overlap for this domain, because a question can be almost
// wordless - "2/5 + 3/7" shares no vocabulary with "adding and subtracting
// fractions", yet they are plainly the same skill.

// FA-Math wraps every question in the same scaffolding. It must be removed before
// features are read: "Feedback Assistant - Mathematics" alone would otherwise
// register as a subtraction on every single question.
const BOILERPLATE = [
  /Feedback Assistant\s*-\s*Mathematics[^.]*\./gi,
  /FEEDBACK ASSISTANT/gi,
  /Hints and feedback will be shown[^.]*\.?/gi,
  /Feedback will be given[^.]*\.?/gi,
  /INSTRUCTIONS?/gi,
  /Move Up|Move Down|Read Less|Read More/gi,
  /MARKS?\s*\[?\s*\d+\s*\]?/gi,
  /Suggested Answer|Feedback|Optional|Delete/gi,
  /Upload a file with your answer[^.]*\.?/gi,
  /Draw (?:and label )?a model[^.]*\.?/gi,
  /No solution needed\.?/gi,
  /Keyword Tags|Question Tags|Authoring Copilot/gi,
  /^Q\d+/i
];

export function stripBoilerplate(text) {
  let clean = flattenMathml(text);
  for (const pattern of BOILERPLATE) clean = clean.replace(pattern, " ");
  return clean.replace(/\s+/g, " ").trim();
}

// Word forms are listed before symbols so that prose questions score the same as
// symbolic ones. Note "-" is deliberately not treated as subtraction: it appears
// in ordinary hyphenation far more often than as an operator.
const OPERATIONS = [
  ["add", /\+|\badd(?:ing|ition|ed)?\b|\bsum\b|\baltogether\b|\bin total\b|\bmore than\b|\b(?:gives?|gave|receives?|received|gets?|got|collects?|collected|buys?|bought|finds?|found)\b[^.!?\n]{0,60}\bmore\b/i],
  // U+2013 EN DASH is punctuation in SLS activity titles ("Length – Convert"),
  // not a mathematical minus. Only U+2212 MINUS SIGN is trusted as a symbol.
  ["subtract", /[−]|\bsubtract(?:ing|ion|ed)?\b|\bdifference\b|\bminus\b|\bhow many more\b|\bleft over\b|\bremaining\b|\bthe rest\b|\b(?:has|had)\b[\s\S]{0,100}\b(?:loses?|lost|eats?|ate|sells?|sold|spends?|spent|uses?|used|removes?|removed)\b|\b(?:gives?|gave)\b[^.!?\n]{0,50}\b(?:away|to)\b/i],
  // "of <number>" was far too loose: "a total mass of 14 kg" is not a
  // multiplication. Only explicit grouping language counts.
  ["multiply", /[×✕]|\\times|\\cdot|\bmultipl(?:y|ying|ication|ied)\b|\bproduct\b|\btimes\b|\b\d+\s*(?:sets?|groups?|rows?)\s+of\b/i],
  ["divide", /[÷]|\\div|\bdivid(?:e|ing|ision|ed)\b|\bquotient\b|\bshared?\s+equally\b|\beach\b|\bper\b/i]
];

// Primary mathematics is mostly "which operation on which kind of number".
// Secondary is not: "Solve 7x = 3x + 8" and "Addition and subtraction of linear
// expressions" share the "+", yet the question is plainly about solving an
// equation. Topics carry the most weight because they are what actually separates
// one Secondary outcome from another.
const TOPICS = [
  // Conversion questions often name neither an arithmetic operation nor a broad
  // topic: "Express 19/100 as a decimal" is nevertheless an assessed piece of
  // mathematics. Treat the direction of the representation change as the topic,
  // which also distinguishes it from reflective prose that happens to mention a
  // number.
  ["fraction to decimal", /\b(?:express|write|convert)\b[\s\S]{0,120}\b(?:as|to|in)\s+(?:a\s+)?decimal\b/i],
  ["decimal to fraction", /\b(?:express|write|convert)\b[\s\S]{0,120}\b(?:as|to|in)\s+(?:a\s+)?(?:fraction|mixed number)\b/i],
  // Place-value questions often contain no trusted operation at all ("what does
  // the digit 4 stand for?"). Decimal expanded notation is even less explicit
  // after SLS duplicates its MathML and LaTeX accessibility text. These named
  // concepts give both forms the same evidence as the syllabus wording.
  ["place value", /\bplace values?\b|\bwhat does (?:the )?digit\b[\s\S]{0,80}\bstand for\b|\bvalue of (?:the )?digit\b/i],
  ["decimal place value", /\bdecimal place values?\b|\b(?:tenths?|hundredths?|thousandths?)\b/i],
  ["data representation", /\bdata representation(?: and interpretation)?\b|\bpie charts?\b|\bbar graphs?\b|\bline graphs?\b|\bpictograms?\b|\bgraphs?\b[\s\S]{0,60}\b(?:number of|data)\b/i],
  ["pie chart", /\bpie charts?\b/i],
  ["bar graph", /\bbar graphs?\b/i],
  ["line graph", /\bline graphs?\b/i],
  ["table", /\bdata tables?\b|\btables?\b(?=[\s,/-]{0,24}(?:below|above|from|shows?|line graphs?|pie charts?))|\bcomplet(?:e|es|ed|ing)\b[\s\S]{0,50}\btables?\b/i],
  ["interpret data", /\bread(?:ing)?\s+and\s+interpret(?:ing)?\s+data\b|\binterpret(?:ing|ation)?\s+(?:the\s+)?data\b/i],
  ["complete table", /\bcomplet(?:e|es|ed|ing)\b[\s\S]{0,50}\btables?\b/i],
  // Probability conditions such as "multiple of 4" must not be mistaken for
  // the Number-and-Algebra topic "factors and multiples". Probability is a
  // first-class topic, while combined/independent-event wording distinguishes
  // the two Secondary outcomes used by this module.
  ["probability", /\bprobabilit(?:y|ies)\b|\bchance\b|\blikelihood\b/i],
  [
    "combined probability",
    /\bcombined events?\b|\bwithout replac(?:ing|ement)\b|\bwith replacement\b|\bpossibility diagrams?\b|\btree diagrams?\b/i
  ],
  ["independent events", /\bindependent events?\b|\bindependently\b/i],
  ["mutually exclusive events", /\bmutually exclusive events?\b/i],
  // Secondary outcomes often contain the same arithmetic words while assessing
  // completely different structures.  In particular, "addition, subtraction
  // and multiplication of matrices" must not match an ordinary calculation just
  // because the operations coincide.  These named structures are therefore
  // first-class topics, and featureScore applies a prerequisite to them below.
  ["matrix", /\bmatri(?:x|ces)\b/i],
  ["quadratic", /\bquadratic\b|\bparabolas?\b/i],
  // Further Differentiation questions can be almost entirely symbolic. The
  // imperative "Differentiate" establishes the Calculus domain, while the
  // suggested answer can safely corroborate the exact rule (for example,
  // Quotient Rule) without opening the candidate pool beyond saved Module Tags.
  ["differentiation", /\bdifferentiat(?:e|es|ed|ing|ion)\b|\bderivatives?\b/i],
  ["derivative notation", /\bf['′](?:\(x\))?|\bf['′]{2}|\bd\s*\/\s*d[xyt]\b|\bstandard notation\b/i],
  ["rate of change", /\brates? of change\b|\bconnected rates?\b/i],
  ["product rule", /\bproduct rule\b|\bproducts? of functions\b/i],
  ["quotient rule", /\bquotient rule\b|\bquotients? of functions\b/i],
  ["chain rule", /\bchain rule\b/i],
  ["second derivative", /\bsecond derivatives?\b|\bf['′]{2}\b|\bd\s*2\s*\/\s*d[xyt]\s*2\b/i],
  ["stationary point", /\bstationary points?\b|\bturning points?\b/i],
  ["maxima minima", /\bmaxim(?:um|a)\b|\bminim(?:um|a)\b/i],
  ["tangent normal", /\btangents?\b|\bnormals?\b/i],
  // Do not use bare "integral": in "integral coefficients" it describes whole
  // number coefficients, not Calculus. Integration verbs, explicit definite or
  // indefinite integrals, and the integral symbol are reliable.
  ["integration", /\bintegrat(?:e|es|ed|ing|ion)\b|\b(?:definite|indefinite) integrals?\b|∫/i],
  ["definite integral", /\bdefinite integrals?\b/i],
  ["area under curve", /\barea\b[\s\S]{0,80}\b(?:under|bounded by|below)\b[\s\S]{0,80}\b(?:curve|x-axis|lines?)\b/i],
  ["kinematics", /\bdisplacement\b|\bvelocity\b|\bacceleration\b|\bparticle moving\b/i],
  // Set questions can be almost entirely symbolic (for example X ∪ Y or
  // A ∩ B'). Treat those symbols as curriculum evidence instead of letting the
  // answer blank's equals sign make the question look like an algebraic equation.
  ["set operation", /[∪∩]|\\(?:cup|cap)\b|\b(?:union|intersection)\b/i],
  [
    "set notation",
    /[∪∩∈∉⊂⊆⊃⊇∅]|\\(?:cup|cap|in|notin|subset(?:eq)?|supset(?:eq)?|emptyset)\b|\bset\s+(?:language|notation)\b/i
  ],
  ["venn diagram", /\bvenn(?:\s+diagrams?)?\b/i],
  [
    "fractional equation",
    /\bfractional\s+equations?\b|\b(?:equations?|solv(?:e|ing))\b[\s\S]{0,100}\b(?:variable|unknown)\b[\s\S]{0,60}\bdenominators?\b/i
  ],
  [
    "function graph",
    /\b(?:sketch(?:ing)?|draw(?:ing)?|plot(?:ting)?)\s+(?:the\s+)?graphs?\b|\bgraphs?\s+of\s+(?:(?:quadratic|linear|cubic|exponential)\s+)?functions?\b|\bparabolas?\b|\bturning\s+points?\b/i
  ],
  ["solve", /\bsolv(?:e|es|ing|ed)\b/i],
  ["equation", /\bequations?\b|[A-Za-z0-9)\s]=\s*[A-Za-z0-9(]/],
  ["linear", /\blinear\b/i],
  ["expression", /\bexpressions?\b|\bsimplif(?:y|ies|ying|ication)\b|\bexpand(?:ing|sion)?\b/i],
  ["variable", /\bvariables?\b|\bunknowns?\b|\balgebraic\b|\balgebra\b|\b\d+[a-z]\b|\b[a-z]\s*=/],
  ["index", /\bindices\b|\bindex\b|\bsquared?\b|\bcubed?\b|\bpowers?\b|\^|\broots?\b/i],
  ["factor", /\bfactoris\w*\b|\bfactors?\b|\bHCF\b|\bLCM\b|\bmultiples?\b|\bprimes?\b/i],
  ["inequality", /\binequalit(?:y|ies)\b|[<>]\s*=?\s*[A-Za-z0-9]/],
  ["word problem", /\breal-world\b|\bformulating\b|\bto solve problems\b|\bword problems?\b/i],
  // "Find the percentage increase" names no operation this extractor trusts and no
  // algebra, so without these it produced only the "percentage" operand and was
  // dropped as having no mathematics - even though the syllabus has an outcome
  // called exactly "Finding percentage increase/decrease".
  // The 2021 syllabus names the outcome "Finding percentage increase/decrease";
  // the 2028 one calls the same idea "percentage change". Both must match, or a
  // percentage question scores no better against its own outcome than against
  // any other outcome that merely mentions percentages.
  ["percentage change", /\bpercentage\s+(?:increase|decrease|change)\b|\b(?:increase|decrease)\s+in\s+percentage\b|\breverse percentage\b/i],
  ["increase", /\bincreas(?:e|es|ed|ing)\b/i],
  ["decrease", /\bdecreas(?:e|es|ed|ing)\b|\breduc(?:e|es|ed|ing|tion)\b/i],
  // "Fraction of a Set of Objects" is its own syllabus branch, and neither the
  // word "set" nor "fractional" was recognised, so a whole module about it matched
  // outcomes about adding fractions instead.
  ["fraction of a set", /\b(?:fraction|part)\s+of\s+a\s+set\b|\bset\s+of\s+objects\b|\bfractional\s+part\b/i],
  ["ratio topic", /\bratios?\b|\bproportion(?:al|ality)?\b|\brate\b|\bspeed\b/i],
  // Geometry prompts are often almost entirely diagrammatic. A stem such as
  // "AOB is a straight line. Find a" contains neither an arithmetic operation
  // nor the word "angle", but it still identifies the exact SLS outcome. Keep
  // the broad angle signal alongside specific relationships so the matcher can
  // distinguish straight-line, point, vertically-opposite and parallel-line
  // outcomes without relying on OCR to rediscover the activity title.
  ["angle", /\bangles?\b|\bdegrees?\b|(?:\d+(?:\.\d+)?|[a-z])\s*[°º]|\bstraight line\b|\btransversal\b/i],
  ["straight-line angles", /\bangles?\s+on\s+(?:a\s+)?straight line\b|\bstraight line\b/i],
  ["angles at a point", /\bangles?\s+at\s+(?:a\s+)?point\b/i],
  ["vertically opposite angles", /\bvertically\s+opposite\s+angles?\b/i],
  ["parallel-line angles", /\bparallel\s+lines?\b|\btransversal\b|\bcorresponding\s+angles?\b|\balternate\s+angles?\b|\binterior\s+angles?\b/i],
  ["angle classification", /\b(?:right|acute|obtuse|reflex)\s+angles?\b/i],
  ["measurement", /\bmeasur(?:e|es|ed|ing|ement)s?\b|\bunits?\s+of\s+measurement\b/i],
  ["unit conversion", /\bconvert(?:s|ed|ing)?\b|\bconversion\b|\bfrom\s+(?:a\s+)?(?:smaller|larger)\s+unit\b/i],
  ["compound units", /\bcompound\s+units?\b/i],
  ["length", /\blength\b|\bdistance\b/i],
  ["mass", /\bmass\b|\bweight\b/i],
  ["liquid volume", /\bvolume(?:\s+of\s+liquid)?\b|\bcapacity\b/i]
];

const MEASUREMENT_FAMILIES = [
  ["length", [
    /\bkilomet(?:re|er)s?\b|\bkm\b/i,
    /\bmet(?:re|er)s?\b|\b\d+(?:\.\d+)?\s*m\b/i,
    /\bcentimet(?:re|er)s?\b|\bcm\b/i,
    /\bmillimet(?:re|er)s?\b|\bmm\b/i
  ]],
  ["mass", [
    /\bkilograms?\b|\bkg\b/i,
    /\bgrams?\b|\b\d+(?:\.\d+)?\s*g\b/i
  ]],
  ["liquid volume", [
    /\b(?:litres?|liters?)\b|ℓ|\b\d+(?:\.\d+)?\s*l\b/i,
    /\bmillilit(?:re|er)s?\b|\bml\b/i
  ]]
];

const OPERANDS = [
  ["mixed number", /\bmixed numbers?\b|\b\d+\s+\d+\s*\/\s*\d+/i],
  ["improper fraction", /\bimproper fractions?\b/i],
  ["proper fraction", /\bproper fractions?\b/i],
  ["fraction", /\\frac|\bfractions?\b|\bfractional\b|\b\d+\s*\/\s*\d+\b|\b\d+\s+\d+\b(?=\s*[+\-×÷])/i],
  ["decimal", /\bdecimals?\b|\b\d+\.\d+\b/i],
  ["percentage", /\bpercent(?:age)?s?\b|%/i],
  ["ratio", /\bratios?\b|\b\d+\s*:\s*\d+\b/i],
  ["whole number", /\bwhole numbers?\b/i],
  ["integer", /\bintegers?\b|\bnegative numbers?\b/i]
];

export function mathFeatures(text) {
  const clean = stripBoilerplate(text);
  const operations = new Set();
  const operands = new Set();
  const topics = new Set();
  for (const [name, pattern] of TOPICS) if (pattern.test(clean)) topics.add(name);
  for (const [name, pattern] of OPERATIONS) if (pattern.test(clean)) operations.add(name);
  for (const [name, pattern] of OPERANDS) if (pattern.test(clean)) operands.add(name);

  // In an SLS fill-in response, "X ∪ Y =" means "evaluate this set
  // operation", not "solve an equation". Keep equation evidence only when the
  // author explicitly says equation/solve; otherwise the set structure wins.
  if (
    topics.has("set operation") &&
    !/\b(?:equations?|solv(?:e|es|ed|ing))\b/i.test(clean)
  ) {
    topics.delete("equation");
  }

  // Rule names are unambiguously differentiation even when the official
  // outcome is tersely worded as only "Use of chain rule". Likewise, definite
  // integrals and area-under-curve wording imply integration. Adding the parent
  // domain here lets the scorer reject Algebra and integration outcomes before
  // comparing the finer rule evidence.
  if ([
    "derivative notation",
    "rate of change",
    "product rule",
    "quotient rule",
    "chain rule",
    "second derivative",
    "stationary point",
    "maxima minima",
    "tangent normal"
  ].some((topic) => topics.has(topic))) {
    topics.add("differentiation");
  }
  if (topics.has("definite integral") || topics.has("area under curve")) {
    topics.add("integration");
  }

  // Diagram OCR for a coordinate graph is commonly little more than tick values
  // followed by the axis labels "x y".  Requiring both axes and several numeric
  // ticks avoids treating an ordinary two-variable expression as a graph, while
  // retaining the only machine-readable clue available for an image-only
  // parabola question.
  const numericTicks = clean.match(/[−-]?\d+(?:[.,]\d+)?/g) ?? [];
  if (
    numericTicks.length >= 4 &&
    /(?:^|\s)x(?:\s|$)/i.test(clean) &&
    /(?:^|\s)y(?:\s|$)/i.test(clean)
  ) {
    topics.add("function graph");
  }

  // Expanded decimal notation is commonly authored as a whole number plus two
  // fractions whose denominators are powers of ten. The live accessible text can
  // contain both a flattened MathML copy and a LaTeX copy, so identify the
  // mathematical structure instead of depending on one rendering. One such term
  // is not enough: ordinary fraction addition with a denominator of 10 must remain
  // a fractions question.
  const decimalFractionTerms = clean.match(
    /\\frac\s*\{\s*[^{}]+\s*\}\s*\{\s*(?:10|100|1000)\s*\}|\b\d+\s*\/\s*(?:10|100|1000)\b/gi
  ) ?? [];
  if (operations.has("add") && decimalFractionTerms.length >= 2) {
    topics.add("place value");
    topics.add("decimal place value");
    operands.add("decimal");
  }

  // A display-dependent subquestion may say only "How many students ate
  // papaya?" while the shared stimulus supplies "pie chart". Once the combined
  // primary evidence identifies a data display, interrogative reading language
  // means the learner is interpreting it rather than constructing/completing it.
  if (
    topics.has("data representation") &&
    /\b(?:how many|how much|which|read|find|determine|calculate)\b/i.test(clean)
  ) {
    topics.add("interpret data");
  }

  // A digit-place-value question about a numeral is about whole numbers even when
  // the author never writes the phrase "whole number". This also prevents it from
  // matching the decimal place-value outcome merely because both mention place
  // value.
  if (
    topics.has("place value") &&
    !topics.has("decimal place value") &&
    /\b\d[\d\s,]{1,}\d\b/.test(clean)
  ) {
    operands.add("whole number");
  }
  let measurementPresent = false;
  let compatibleUnitPair = false;
  for (const [topic, patterns] of MEASUREMENT_FAMILIES) {
    const unitCount = patterns.filter((pattern) => pattern.test(clean)).length;
    if (unitCount === 0) continue;
    measurementPresent = true;
    topics.add(topic);
    if (unitCount > 1) compatibleUnitPair = true;
  }
  if (measurementPresent) topics.add("measurement");
  if (compatibleUnitPair) {
    topics.add("compound units");
    if (/=|→|\bconvert\w*\b|\bconversion\b|\bexpress\b|\bwrite\b[\s\S]{0,80}\bin\b|\bhow many\b/i.test(clean)) {
      topics.add("unit conversion");
    }
  }
  // A specific fraction kind implies the general one, so a question about mixed
  // numbers still matches an outcome phrased about fractions.
  if (operands.has("mixed number") || operands.has("improper fraction") || operands.has("proper fraction")) {
    operands.add("fraction");
  }
  return { operations, operands, topics, clean };
}

function overlap(a, b) {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared;
}

// Topics outrank operations, which outrank operand types. "Solving linear equations
// in one variable" and "Addition and subtraction of linear expressions" both involve
// a "+", so only the topic tells them apart.
export function featureScore(questionFeatures, outcomeFeatures) {
  const operationHits = overlap(questionFeatures.operations, outcomeFeatures.operations);
  const operandHits = overlap(questionFeatures.operands, outcomeFeatures.operands);
  const topicHits = overlap(questionFeatures.topics || new Set(), outcomeFeatures.topics || new Set());

  // A specialised representation must be named or otherwise detected on both
  // sides. Generic operations are never sufficient evidence for a matrix or a
  // function-graph outcome. This is deliberately narrow: it prevents structural
  // false positives without making every broad syllabus topic mandatory.
  for (const required of [
    "matrix",
    "function graph",
    "set operation",
    "venn diagram",
    "probability"
  ]) {
    if (
      (outcomeFeatures.topics || new Set()).has(required) &&
      !(questionFeatures.topics || new Set()).has(required)
    ) {
      return 0;
    }
  }

  // Conversely, once the assessed question explicitly establishes probability,
  // an outcome from a different syllabus branch cannot win merely because the
  // event condition says "odd", "divisible", "factor", or "multiple".
  if (
    (questionFeatures.topics || new Set()).has("probability") &&
    !(outcomeFeatures.topics || new Set()).has("probability")
  ) {
    return 0;
  }

  // A shared topic stands on its own: an outcome about solving equations matches a
  // solve-the-equation question even though the outcome names no operation. Without
  // this, the operation gate below would throw the right answer away.
  if (topicHits === 0 && outcomeFeatures.operations.size > 0 && operationHits === 0) return 0;

  // And the kind of number must not contradict. A fractions question should not be
  // tagged to "multiplication algorithm ... Whole Numbers" merely because both
  // involve multiplying: when each side names operands and they share none, the
  // outcome is about different mathematics. Leaving it untagged beats tagging it
  // wrongly.
  if (
    questionFeatures.operands.size > 0 &&
    outcomeFeatures.operands.size > 0 &&
    operandHits === 0
  ) {
    return 0;
  }

  // Tie-break on specificity. "Solving linear equations in one variable" and
  // "Formulating a linear equation in one variable to solve problems" share every
  // topic a bare "Solve 8z = 11 - 2z" has, but the second also demands a word
  // problem, which this question is not. An outcome that names concepts absent from
  // the question is the looser fit. The penalty is 1, so it only settles ties and
  // never overturns a real topic (5) or operation (3) match.
  let unmatched = 0;
  for (const topic of outcomeFeatures.topics || new Set()) {
    if (!(questionFeatures.topics || new Set()).has(topic)) unmatched += 1;
  }

  return topicHits * 5 + operationHits * 3 + operandHits * 2 - unmatched;
}

// Whether a question is asking mathematics at all. Deliberately the same rule the
// tagger uses to decide it can propose an outcome, so the two never disagree: if a
// question is worth a learning outcome it belongs in Learning Progress, and a
// reflective prompt ("How did the hints/feedback help me?") belongs in neither.
export function looksMathematical(text) {
  const features = mathFeatures(text || "");
  return features.operations.size > 0 || features.topics.size > 0;
}
