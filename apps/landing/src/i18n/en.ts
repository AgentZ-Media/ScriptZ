/**
 * English strings for the landing.
 *
 * Mirrors `de.ts` 1:1 - TypeScript enforces full coverage via the
 * `Record<keyof typeof de, string>` type below. Add keys in `de.ts`
 * first, then add the matching English translation here.
 */
import type { de } from "./de";

export const en: Record<keyof typeof de, string> = {
  // ===================== Hero =====================
  "hero.eyebrow": "SCRIPTZ // FOR CONTENT CREATORS",
  "hero.h1.line1": "Write,",
  "hero.h1.line2": "don't format.",
  "hero.lead":
    "The script editor for content creators. From idea to finished script in minutes. No screenplay corset, no AI, no subscription. Just you, your idea and a cursor that gets out of the way.",
  "hero.cta.download": "Free for macOS",
  "hero.cta.github": "On GitHub",
  "hero.meta.os": "macOS 13+",
  "hero.meta.zero": "0 trackers · 0 accounts · 0 AI",
  "hero.web.intro": "Want to try it first?",
  "hero.web.link": "Test it right in your browser →",
  "hero.web.hint": "Test editor, local in your browser. Data stays there.",

  "install.summary": "macOS blocks the app the first time you open it?",
  "install.body":
    "That's normal - ScriptZ is open source and not registered with Apple. Run this command in Terminal once, then everything works as expected:",
  "install.copy": "Copy",
  "install.copied": "Copied ✓",
  "install.copyManual": "Please copy manually",
  "install.why":
    "Apple charges for a signature that would skip this step. Until that pays off, the short command is the price for ScriptZ staying free and account-less.",
  "install.whyShort.label": "Why?",
  "install.whyShort.body":
    "Apple charges for a signature that would skip this step. Until that pays off, the short command is the price for ScriptZ staying free and account-less.",

  // ===================== App-Chrome / Tabs =====================
  "tab.home.title": "Overview",
  "tab.home.aria": "Overview (back to top)",
  "tab.ideas.title": "Ideas",
  "tab.ideas.aria": "Ideas",
  "tab.warum.short": "Why?",
  "tab.warum.long": "Write scripts without the app getting in the way",
  "tab.quickmodus.short": "Quick mode",
  "tab.quickmodus.long": "Quick mode - the trick nobody else can do",
  "tab.noai.short": "No AI",
  "tab.noai.long": "The no-AI manifesto",
  "tab.compare.short": "Compare",
  "tab.compare.long": "Compared to everything else",
  "tab.download.short": "Download",
  "tab.download.long": "Download - macOS, free",

  "status.opensource": "Open Source",
  "status.saved": "Saved",

  "toolbar.back.aria": "Back to overview",
  "toolbar.back.label": "Overview",
  "toolbar.pill.action": "ACTION",
  "toolbar.pill.character": "CHARACTER",
  "toolbar.pill.dialog": "DIALOG",
  "toolbar.download": "Download",

  // ===================== Tab: WARUM =====================
  "warum.caption": "INT. WRITE-SCRIPTZ.COM — NOW",
  "warum.action1":
    "An empty page. Cursor blinks. You type and the formatting just happens. Character name? Auto-centered, all caps. Tab? Block switch. Enter? Next line - usually already in the right block.",
  "warum.action2":
    "ScriptZ is built for content creators, not for screenwriters. You don't want a 90-minute feature-film layout. You want a TikTok script done by half past two, before the good light is gone.",
  "warum.timo1.paren": "(direct)",
  "warum.timo1.dialog":
    "You type, the editor formats. Characters are auto-detected, get a color, a speaking-time stat. You don't have to set anything up. You don't have to click anything. You just have to write.",
  "warum.axel1.dialog": "Sounds like every tool since 2015.",
  "warum.timo2.dialog":
    "Try it. Make a script, write two speakers. Then hit Enter. You'll see the cursor land in the right block, with the right speaker in front. That's quick mode. It saves two keystrokes per switch - and on a 60-second reel with 12 switches, that's a minute.",
  "warum.axel2.paren": "(curious)",
  "warum.axel2.dialog": "And AI? Does it suggest what to say?",
  "warum.timo3.dialog":
    "No. Deliberately not. Creativity is your job. If you wanted a model to write for you, you'd have ChatGPT open.",
  "warum.cut": "CUT TO: SCREENSHOT",
  "warum.action3": "Three views of the app. Click the tabs - the app is these tabs.",

  "shot.tab.overview": "Overview",
  "shot.tab.ideas": "Ideas",
  "shot.tab.editor": "Editor",
  "shot.alt.overview": "ScriptZ overview with script list and characters",
  "shot.alt.ideas": "ScriptZ ideas inbox",
  "shot.alt.editor": "ScriptZ editor with character highlights and cast sidebar",

  "jump.label.long": "Up next:",
  "jump.label.short": "Next:",
  "jump.btn.quickmodus": "→ Quick mode explained",
  "jump.btn.noai": "→ Why no AI",
  "jump.btn.noaiAlt": "→ Why no AI",
  "jump.btn.compare": "→ Compared to others",
  "jump.btn.compareShort": "→ Compare",
  "jump.btn.download": "→ Download",
  "jump.btn.backToStart": "→ Back to start",

  // ===================== Tab: QUICKMODUS =====================
  "quick.caption": "INT. QUICK MODE — TWO SPEAKERS, ONE FLOW",
  "quick.action1":
    "Quick mode is what makes ScriptZ irreplaceable. Once your script has exactly two speakers, it kicks in. After each dialog, one Enter and the cursor jumps automatically to the other character and right into the next dialog. No Tab, no typing the speaker name, no second Enter.",
  "quick.sfxLabel": "SFX:",
  "quick.sfxText": "tack-tack-tack",
  "quick.action2":
    "In practice: two keystrokes saved per speaker switch. On a typical 60-second reel with ten to twelve switches, that's almost a minute. Three scripts a day? Three minutes. Per week? A quarter hour you spent writing instead of formatting.",
  "quick.timo1.dialog": "Here's what it looks like for real. I type something.",
  "quick.axel1.dialog": "I reply. Enter.",
  "quick.timo2.dialog": "Cursor is already here. Nobody typed „TIMO\".",
  "quick.axel2.dialog": "Nobody typed „AXEL\". Nobody hit Tab.",
  "quick.timo3.dialog": "We just write. The editor knows what we want.",
  "quick.action3":
    "Three characters in the script? Quick mode pauses automatically - then the editor doesn't know who's next. Drop back to two and it's back. No switch, no setting, no learning curve.",
  "quick.callout.eyebrow": "THE DETAIL THAT MATTERS",
  "quick.callout.body":
    "Neither Word, nor Notion, nor Final Draft, nor ChatGPT, nor Apple Notes does this. For us it's a core feature, from day one. Anyone who's ever typed two speakers at once knows what that saves per day.",

  // ===================== Tab: NO-AI =====================
  "noai.caption": "INT. NO-AI MANIFESTO",
  "noai.action1":
    "ScriptZ has no AI built in. No chat window, no „write me a script\", no auto-rephrasing, no suggestions, no autocomplete beyond character names from your own script. Deliberately not.",
  "noai.axel1.paren": "(skeptical)",
  "noai.axel1.dialog": "Every other tool has AI. You're selling „no AI\" as a feature?",
  "noai.timo1.dialog":
    "Yes. Because your voice is your product. If a model writes half the script, half the voice is the model.",
  "noai.axel2.dialog": "Sometimes you just get stuck.",
  "noai.timo2.dialog":
    "Then the answer isn't „let the model take over\", it's „take a three-minute break\". That's what the sprint timer and the ideas inbox are for. Both offline, both without a foreign voice.",
  "noai.camera": "CAMERA: HOLDS ON IT.",
  "noai.card1.title": "No API key",
  "noai.card1.body": "No cloud keys, no tokens, no per-word billing.",
  "noai.card2.title": "No training-data contribution",
  "noai.card2.body": "Your script doesn't get uploaded. It lives locally in a SQLite file.",
  "noai.card3.title": "No „improve\" button",
  "noai.card3.body": "Your script isn't broken. It doesn't need outside improvement.",
  "noai.card4.title": "Instead: a fast editor",
  "noai.card4.body":
    "Quick mode, character auto-detection, block hotkeys. Tools that carry your idea from your head to the page - without rewriting it.",

  // ===================== Tab: VERGLEICH =====================
  "cmp.caption": "EXT. THE COMPETITION — AN HONEST COMPARISON",
  "cmp.action1":
    "Other tools can do plenty we can't. Here's the list of what we can do that they can't:",
  "cmp.head.crit": "What you need",
  "cmp.row.format": "Format happens without you",
  "cmp.row.quick": "Quick mode for 2 speakers",
  "cmp.row.chars": "Characters auto-detected",
  "cmp.row.short": "Built for short-form",
  "cmp.row.noai": "Deliberately no AI",
  "cmp.row.local": "Free & local",
  "cmp.row.fast": "Open in < 1s",
  "cmp.mark.yes": "YES",
  "cmp.mark.no": "NO",
  "cmp.mark.feature": "Feature film",
  "cmp.mark.featureNo": "NO, feature film",
  "cmp.mark.copilot": "Copilot",
  "cmp.mark.notionai": "Notion AI",
  "cmp.mark.isai": "It is AI",
  "cmp.mark.beatai": "Beat AI",
  "cmp.mark.appleint": "Apple Int.",
  "cmp.mark.cloud": "Cloud",
  "cmp.mark.paid": "Paid",
  "cmp.mark.appleonly": "Apple-only",
  "cmp.mark.meh": "Meh",
  "cmp.action2":
    "We can replace none of that. Final Draft can submit a feature screenplay to the WGA. Notion can run a wiki. ChatGPT can brainstorm with you. We can: scripts for reels, fast. That's all - and it was worth it to us.",

  // ===================== Tab: DOWNLOAD =====================
  "dl.caption": "INT. DOWNLOAD — ONE CLICK",
  "dl.action1":
    "macOS 13 or newer. Free. Open source. First launch: right-click the app icon → „Open\". Apple requires that for unsigned apps. Updates come automatically after that.",
  "dl.eyebrow.os": "macOS 13+",
  "dl.h": "Free. Local. No account.",
  "dl.sub":
    "One .dmg, no trackers, no sign-in, no „updates by email\". You download the app, drag it to your Applications folder, and that's it.",
  "dl.cta.dmg": "Download .dmg",
  "dl.cta.code": "Source on GitHub",
  "dl.stat.version": "current version",
  "dl.stat.tracker": "trackers",
  "dl.stat.accounts": "accounts",
  "dl.stat.ai": "AI",
  "dl.stat.dmg": ".dmg",
  "dl.web.intro": "No Mac handy?",
  "dl.web.link": "Test it right in your browser →",
  "dl.web.sub": "Test editor, no account, all local in your browser.",
  "dl.sfxLabel": "SFX:",
  "dl.sfxText": "First launch",
  "dl.action2":
    "On first launch, macOS reports the app cannot be verified. That's normal - ScriptZ is open source and not registered with Apple. Run the command below in Terminal once, then everything works as expected.",
  "dl.fadeOut": "FADE OUT.",
  "dl.end": "END",

  // ===================== Tab: IDEEN =====================
  "ideas.h": "Ideas",
  "ideas.sub":
    "Collect what you want to write next — and turn it into a script the moment the idea has legs.",
  "ideas.input.placeholder": "What do you want to write about?",
  "ideas.search.placeholder": "Search ideas…",
  "ideas.filter.open": "Open",
  "ideas.filter.all": "All",
  "ideas.filter.used": "Used",
  "ideas.sort": "Sort · Newest",
  "ideas.btn.script": "Script →",
  "ideas.btn.delete.aria": "Delete idea",
  "ideas.hint.before": "in the app opens this inbox as an overlay — wherever you are. Type, Enter, done.",

  // Idea samples
  "ideas.sample.tutorial.title": "Tutorial: From empty cursor to finished script in 5 minutes",
  "ideas.sample.tutorial.body":
    "Screen recording with a stopwatch. Turn on quick mode, just type, export - done. Proof, not a claim.",
  "ideas.sample.tutorial.age": "2h ago",
  "ideas.sample.fd.title": "Why I stopped using Final Draft for TikTok",
  "ideas.sample.fd.body":
    "License, screenplay layout, Courier 12pt. All built for 90-minute movies. I need 60 seconds.",
  "ideas.sample.fd.age": "4h ago",
  "ideas.sample.word.title": "A moment of silence for Word power users",
  "ideas.sample.word.body":
    "Click, click, click, click. Manual indent. Character name bold, new line, centered. Tab, tab, tab.",
  "ideas.sample.word.age": "6h ago",
  "ideas.sample.noai.title": "ScriptZ without AI - on purpose",
  "ideas.sample.noai.body":
    "Other tools write the script for you. We write nothing for you. You're the creator, not the model.",
  "ideas.sample.noai.age": "9h ago",
  "ideas.sample.reel.title": "Reel: quick mode explained in 30 seconds",
  "ideas.sample.reel.body":
    "Two-hander dialog. Hit Enter. Speaker switches automatically. That's it.",
  "ideas.sample.reel.age": "14h ago",
  "ideas.sample.morning.title": "What happens when you didn't write anything in the morning",
  "ideas.sample.morning.body":
    "Streak breaks. Heatmap gap. Day lost. As motivating as the 6 AM alarm.",
  "ideas.sample.morning.age": "1d ago",
  "ideas.sample.cliche.title": "Cliché Gen Z in a job interview",
  "ideas.sample.cliche.age": "used yesterday",

  // ===================== Footer =====================
  "footer.col.project": "Project",
  "footer.col.legal": "Legal",
  "footer.col.contact": "Contact",
  "footer.link.github": "GitHub",
  "footer.link.releases": "Releases",
  "footer.link.imprint": "Imprint",
  "footer.link.privacy": "Privacy",
  "footer.link.email": "Email",
  "footer.about.eyebrow": "ABOUT SCRIPTZ",
  "footer.about.body":
    "A script editor for content creators that gets out of your way. Format happens as you type, characters are auto-detected, quick mode saves two keystrokes per speaker switch. All local, all in a SQLite file on your Mac. No cloud, no account, no AI.",
  "footer.about.os": "macOS 13+ · Open Source",

  // ===================== Sprint pill =====================
  "sprint.label": "Reading sprint",

  // ===================== Language toggle =====================
  "lang.toggle.aria": "Switch language",
  "lang.toggle.de": "DE",
  "lang.toggle.en": "EN",

  // ===================== Page meta =====================
  "meta.title": "ScriptZ - the script editor for content creators",
  "meta.description":
    "Write, don't format. From idea to finished script in minutes. Local, free, open source. For TikTok, Reels and YouTube Shorts.",
  "meta.ogLocale": "en_US",
};
