# Facilitator Guide

## Workshop: Build a Website in 30 Minutes with AI

**Format:** 30-minute hands-on workshop
**Audience:** Non-technical, mixed ages, small groups
**Setup:** Facilitator with projector/big screen, groups at tables with devices

---

## Pre-Workshop Checklist

### Tech Setup (Do 30+ minutes before)

- [ ] Server running (`npm start` on host machine)
- [ ] Ollama running with model loaded (`ollama run qwen2.5-coder:14b` then exit — this preloads the model)
- [ ] Dashboard accessible at `http://<your-ip>:3000/dashboard`
- [ ] Set table count on dashboard to match number of groups
- [ ] Test one table end-to-end: open `/table/1`, submit a prompt, confirm preview appears
- [ ] Projector connected and showing dashboard
- [ ] Wi-Fi network name and password visible/posted for participants
- [ ] Participant handouts printed or digitally shared

### Room Setup

- [ ] Each table has a visible table number matching their URL
- [ ] Table signs with URL: `http://<your-ip>:3000/table/<number>`
- [ ] Prompt library printed at each table (or QR code to digital version)

---

## Run-of-Show

### Opening — "The Future of Building" (0:00 - 5:00)

**Big screen:** Slides

**Talking points:**

> "What if I told you that by the end of this session — in about 25 minutes — every group in this room will have built a fully designed, animated, responsive website? No coding. No design experience. Just a description of what you want."

- Briefly explain what agentic coding is: AI that doesn't just suggest code, it *builds* the whole thing for you
- This isn't a future concept — it's here now, and you're about to use it
- Frame the shift: we're moving from "learning to code" to "learning to direct AI"
- Today's exercise: each table will go through three rounds of building, each more ambitious than the last

> "Think of yourselves as creative directors. You describe the vision. The AI builds it. Let's see what you come up with."

**Transition cue:** "Let's get set up."

---

### Platform Intro + Quick Demo (5:00 - 7:00)

**Big screen:** Switch to dashboard, then briefly show a table view

**Talking points:**

- Point participants to their table URL (on table signs or handout)
- Walk through the interface: prompt box on the left, live preview on the right
- Show the three step buttons: Create, Customize, Go Wild
- Do a 30-second live demo: type a simple prompt ("A landing page for a coffee shop"), hit send
- Point out the streaming code on the left and the preview appearing on the right

> "You'll see the AI writing the code in real time on the left. When it's done, your website appears on the right. Everyone in the room can see all the sites appearing on this dashboard behind me."

- Switch big screen back to dashboard

> "Now it's your turn. Step 1: Create. Describe any website you want. Be specific — the more detail you give, the better the result. You have about 8 minutes. Go!"

---

### Step 1: Create (7:00 - 17:00)

**Big screen:** Dashboard (live screenshot grid)

**Your role:**
- Walk the room. Help groups who are stuck on what to prompt
- Point to the prompt library if groups need inspiration
- Encourage specificity: "Don't just say 'a restaurant website' — describe the vibe, the colors, the sections you want"
- As sites start appearing on the dashboard, narrate from the front: "Table 3 is building a fitness studio site — looking great!"
- Build energy by pointing out impressive results as they appear

**Common issues:**
- "Nothing is happening" → Check they're on the right URL and clicked "Send to Claude"
- "It's taking a long time" → Normal, Ollama needs 30-90 seconds. The code streams in real time so they can watch
- "I got an error" → Click "1. Create" again and re-submit. If persistent, check server logs

**At ~15:00, give a 2-minute warning:**

> "Two more minutes on your first creation! If you haven't submitted yet, go ahead and send something now."

**Transition at 17:00:**

> "Incredible work. Look at this dashboard — every table built a completely different website. Now here's where it gets interesting. Step 2: Customize. Click the 'Customize' button and tell the AI what to change. New colors, different layout, add sections, change the text — whatever you want. The AI will take your existing site and modify it. You have 5 minutes."

---

### Step 2: Customize (17:00 - 22:00)

**Big screen:** Dashboard

**Your role:**
- Encourage groups to be bold: "Change the entire color scheme," "Add an animated hero section," "Make it feel more premium"
- Point out the key insight: the AI *reads their existing site* and modifies it, rather than starting over
- Continue narrating standout results from the dashboard

**Talking point while walking:**

> "Notice what's happening here — you're having a conversation with the AI about design. You're iterating. This is exactly how professionals will work with these tools."

**Transition at 22:00:**

> "Now for the fun part. Step 3 is called 'Go Wild.' This tells the AI to add advanced effects — particle animations, parallax scrolling, 3D transforms, dynamic backgrounds. Same site, but cranked up to eleven. Hit 'Go Wild' and just watch what happens."

---

### Step 3: Go Wild (22:00 - 27:00)

**Big screen:** Dashboard

**Your role:**
- This is the "wow" moment — let the energy build
- Walk the room, react to results, point out jaw-dropping effects
- Encourage groups to look at other tables' screens too
- As results come in on the dashboard, narrate the transformations

> "Look at Table 5 — they started with a simple bakery site and now it has floating particles and a 3D rotating gallery!"

---

### Gallery Walk + Closing (27:00 - 30:00)

**Big screen:** Dashboard — click through each table's site in the modal view

**Talking points:**

> "Let's take a quick tour of what everyone built."

- Click through 4-6 of the most impressive sites on the dashboard (full-screen modal)
- Pause on each for a few seconds, acknowledge the group

> "Every site you see here was built entirely by AI, directed by people in this room — most of whom have never written a line of code."

- Close with the bigger picture:

> "What you just experienced is the leading edge of a fundamental shift. The barrier between having an idea and building it is disappearing. These tools are getting better every month. The skill that matters now isn't coding — it's knowing what to ask for and how to direct the AI effectively. You just practiced that skill."

> "Thank you for building with us today."

---

## Troubleshooting Quick Reference

| Issue | Fix |
|-------|-----|
| Site won't load | Check server is running (`npm start`) |
| Participant can't connect | Verify they're on the same Wi-Fi network and using the right IP |
| Generation stuck/slow | Ollama may be overloaded — wait, or restart Ollama |
| Error on submit | Check Ollama is running: `curl http://localhost:11434/api/tags` |
| Dashboard not updating | Refresh the dashboard page |
| Screenshots not appearing | Puppeteer needs Chromium — run `npm install` to ensure it's downloaded |
| Need more/fewer tables | Use the table count control on the dashboard header |

---

## Tips for Maximum Impact

- **Pre-load the model** by running one generation before participants arrive. First run downloads/loads the model and is slower.
- **Use the dashboard narration** as your secret weapon. Calling out results as they appear creates excitement and friendly competition.
- **Have 2-3 "backup prompts"** ready for groups who freeze up. The prompt library helps, but sometimes pointing at one and saying "try this one" is faster.
- **Don't over-explain the tech.** The power of this demo is that it speaks for itself. Let people experience it, then contextualize afterward.
- **If running multiple sessions**, reset all tables between sessions using the "Reset All" button on the dashboard.
