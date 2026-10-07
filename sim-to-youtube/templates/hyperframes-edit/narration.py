"""Voice-over for Part 2: xAPI + SLS Data Assistant across a whole class (Kokoro am_michael, speed 1.0).

Source = screen_XXXX.mp4 (1900x966). Every claim is checked against the footage (source seconds in brackets).
Student names are blurred in the edit and never spoken.
"""

VOICE = "am_michael"
SPEED = 1.0

CUES = [
    # [230-300] Generated Analysis: three common errors, each with the students who made it
    ("hook_1", "One click. The three most common errors your whole class made in a virtual lab."),
    ("hook_2", "And exactly which students made each one. This is the SLS Data Assistant, reading x API evidence."),
    ("title", "Part two. From one student's evidence, to the whole class."),
    ("recap", "In part one, we used a ChatGPT plugin to add x API to a simulation, so every experiment a student runs "
              "comes back to SLS as feedback. Today, the payoff. What happens when a whole class does it?"),
    # [0-30] S4-F Physics class group, 28 students, Assignments tab, IP4.15.3 Electromagnetism Lab
    ("cls_1", "Here's a real physics class group, set up by teacher friends who kindly let me use it. "
              "Twenty-eight students. In Assignments, open the Electromagnetism Lab."),
    # [44-66] Simulated Experiment > Experiment to Measure Magnetic Force; controls: Turn Switch On, Current, Reverse I, Flip B
    ("sim_1", "Inside is a simulated experiment, Experiment to Measure Magnetic Force, with x API built in."),
    ("sim_2", "Students switch on the circuit, set the current, reverse the current, or flip the magnet. "
              "The live data shows the current, the force in millinewtons, and the reading on the balance."),
    # physics primer (gfx)
    ("phy_1", "The physics. A wire carrying a current in a magnetic field feels a force. F equals B, I, L. "
              "Field strength, times current, times the length of wire in the field."),
    ("phy_2", "So if the current is zero, the force is zero. Double the current, and the force doubles. "
              "Reverse the current, or flip the magnet, and the force changes direction, as Fleming's left-hand rule predicts."),
    # [66-86] Monitor: You're viewing <student>; Feedback: Interactions 1, Elapsed 73s, Score 0/4, Unique explorations 1
    ("mon_1", "In Monitor, you can open each student's work. This student's feedback says it all. "
              "One interaction. Seventy-three seconds. Score, zero out of four."),
    ("mon_2", "That's useful. But it's one student. With a class of twenty-eight, opening every response one by one "
              "takes the whole lesson."),
    # [86-118] View All Responses; "Data is not updated in real time."; simulation renders in each row
    ("all_1", "So SLS has an entry point called View All Responses. Every student, every response, on one page."),
    ("all_2", "It tries to render the simulation in every row, so it can look busy. Note: data is not updated in real time. "
              "Press refresh to pull in new submissions."),
    # [118-175] Data Assistant button; recipes; instruction text; Generate
    ("da_1", "Now the button that changes everything. Data Assistant."),
    ("da_2", "Pick a recipe. Identify common errors. Identify common themes. "
             "Identify specific responses or misconceptions. Or write your own."),
    ("da_3", "I'll use common errors. Based on Feedback, identify the three most common errors students have. Then, generate."),
    ("da_4", "Here's the key idea. The Data Assistant isn't only reading answers. Because of x API, it reads the feedback "
             "the interactive sent back, which is a record of what each student actually did in the lab."),
    # [190-205] Generating analysis... up to 30 seconds
    ("gen_1", "It says the analysis may take up to thirty seconds."),
    # [205-300] Generated Analysis
    ("res_1", "The overview: most students engaged with the apparatus, but struggled to turn exploration "
              "into an accurate understanding of the magnetic force."),
    ("err_1", "Error one. Failure to activate the circuit, or turn on the switch, before manipulating variables. "
              "Students adjusted the rheostat, the magnet and the current direction, while the switch was off. "
              "So every force reading was zero."),
    ("err_1b", "And the physics explains why. With no current, F equals B I L gives zero. These students never saw the most basic "
               "observation: current must flow for a magnetic force to exist. The Data Assistant lists who they are."),
    ("err_2", "Error two. Incomplete exploration of how force depends on current. Students didn't vary the current "
              "systematically over a wide range, so they couldn't see the linear relationship."),
    ("err_3", "Error three. Difficulty combining the variables. Students explored current, orientation and direction "
              "separately, but couldn't bring them together to explain both the size and the direction of the force."),
    ("warn", "Notice the reminder at the top. The Data Assistant uses generative AI, so review the analysis before you act on it."),
    # [318-350] Add Feedback: selected students 4, feedback text, Notify student(s), send
    ("fb_1", "Then act on it. From each error, add feedback to exactly the students who made it. "
             "Here, four students are selected, and the feedback text is ready."),
    ("fb_2", "Tick notify, press send, and it lands in each student's notification bell in SLS. "
             "I won't send it in this demo, but that's the loop."),
    # teaching moves (gfx)
    ("teach", "And for the next lesson, the analysis practically writes itself. Start with a thirty-second demo: switch on first. "
              "Then ask everyone to record the force at five currents and plot it. "
              "Finally, use Fleming's left-hand rule to combine field, current and force."),
    ("close_1", "This is what data-informed teaching looks like. x API captures the process. "
                "The Data Assistant finds the patterns. And you decide what to do next."),
    ("cta", "Watch part one to build your own x API interactive. Free simulations at i want to study dot org. "
            "Tell me in the comments what your class's most common error would be."),
]
