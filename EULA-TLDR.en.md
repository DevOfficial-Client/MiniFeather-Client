# minifeather client — human-readable eula (tl;dr)

> [!note]
> this is the easy, made-with-love version of the [full eula](eula.md). fun to read, but just as serious where it matters.
> english version of [eula-tldr.en.md](eula-tldr.en.md). este documento también está disponible en español: [eula-tldr.md](eula-tldr.md)

---

## 1. what is this? (・o・)

minifeather is a client made by miniblox fans, for miniblox fans.
**we have nothing to do with official miniblox.** they don't pay us, sponsor us, or invite us to the party. (◞‸◟)

it's also **w.i.p.** (work in progress), meaning: we're building the plane while you fly it. there can be bugs, half-finished stuff, and features that vanish overnight. if something explodes... relax, it was free. ᕙ(⇀‸↼‶)ᕗ

## 2. the most important thing, up front and in bold

**nobody is forcing you to use the client, you use it because you want to xd** (๑>ᴗ<๑)

seriously: if something goes wrong (ban, bug, jump scare), that's on you. we warned you everywhere. if you don't agree with that, close this tab and get on with your life, no hard feelings. (~‾⌣‾)~

## 2.5. let's talk about this: nobody pays us (╥_╥)

yes, you read that right: **nobody pays us to do this.** zero. nothing. not a single cent. we do it for free, in our spare time, after work/school, half asleep, out of pure love for the game. (ᵕ—ᴗ—)

and speaking of sleep: there are nights of coding at 3am. and days we never slept at all. literally. the sun comes up and there we are, fighting a bug nobody asked us to fix, for free, while the rest of the world sleeps. if the client works today, it's partly thanks to those dawns nobody ever hears about. (=_=)

and still, some people show up just to insult the devs. over a free client. that nobody forced them to use. that we built without charging anyone. (눈_눈)

and the best part: **they treat us like thieves.** "they probably steal accounts", "they probably steal your session", "it's probably a keylogger". friends... if we were thieves, would we be working for free at 3am? thieves sleep at that hour. we don't. (¬_¬)

the code is public, it's on github, you can read every line. but hey, insulting is easier than reading, right?

and there's another group: the ones who think **that because the client has bugs, it's bad and useless.** friend, do you know what else had bugs at first? literally every piece of software that exists. windows, your favorite game, your bank's app. the difference is they have paid teams and we have... motivation and coffee. a bug doesn't make the client bad, it makes it **w.i.p.** (remember section 1?). what would make it bad is abandoning it. and that's not happening. (•̀ᴗ•́)و

a reported bug gets fixed. an empty complaint doesn't. you choose which one to send.

if that's you: please reconsider your priorities. devs have feelings too (and expensive coffee). if you don't like something, you can say it without insulting, or even better: **report the bug nicely on discord** and we'll take a look. we promise not to cry. much. (˘̩̩̩ε˘̩ƪ)

if you're one of the good ones: thank you, from the bottom of our hearts. you're the reason we keep going. ᕦ(ò_óˇ)ᕤ

## 3. what you should not do with the client ٩(◕‿◕)ノ

- **don't use it for unfair advantage on competitive servers.** baritone, bots, anti-afk and friends: use them in your own world, with your friends, where the server allows it. if you get banned for cheating in ranked pvp... well... ¯\\\_(ツ)\_/¯
- high-risk modules show a warning before activation. closing it cancels activation; “don't show again” saves your acceptance in the browser. **accepting the warning does not mean the server permits the module or prevent a ban.**
- **don't sell the client or modified copies** passing them off as official. that's just ugly.
- **don't bypass anticheats, payments or security systems.** we're not that kind of project.
- **don't harass anyone.** not with ai, not with bots, not with anything. be a good blob citizen. (｡•́︿•̀｡)

## 4. things worth knowing about your data ʕ•ᴥ•ʔ

- **nobody here steals your data.** seriously. for starters, **we don't even ask for or store your miniblox password**... and well... why the hell would we want a miniblox account? we have enough problems with the bugs already. (￣ω￣)
- your settings, waypoints, skins and nicknames are stored **in your browser**, unencrypted. your pc, your vault.
- **clientchat and calls** use public channels (ntfy.sh): they work like a town square. **don't send passwords or personal data there** — anyone with the channel name can read along. (∩`ω´)⊃))
- **voice** only asks for your microphone if you accept a call (`/call on` to enable, `/call off` to shut it all down).
- if you set up an **ai api key**, it's stored in plain text. use one with a spending cap, not your master key.
- github, klipy, peerjs and friends only see what's needed to work (downloads, gif searches, etc.).

## 4.2. about minifeather accounts (yes, they exist XD)

- **yes, there are minifeather accounts**, and they're **optional**: they exist for the community ecosystem (shared skins, ranks, pets). if you never create one, the client works just the same. nothing forces you.
- **they have nothing to do with your miniblox account.** different universe: their own username and password, no connection to your game session. one thing at a time. (・_・;)
- when you create one, your password is **stored hashed (pbkdf2, 200k iterations)** in a private database. never in plain text in the db.
- **but let's be honest:** the creation request travels through ntfy.sh, which is a public channel. that's why: **never reuse your email, discord or miniblox password here.** use a unique, disposable password, sleep well. (∩`ω´)⊃))
- accounts are managed by the devs with a discord bot (linking, skins, etc.). if something breaks... section 4.5. ᕕ( ᐛ )ᕗ

## 4.5. about bugs and exploits (the unintentional ones, obviously)

sometimes a bug slips through. or an exploit. **it's not intentional**, we swear on our coffee. when we find out something is broken or something can be abused, **we try to fix it and put limits in place** as soon as possible. (๑•̀ㅂ•́)و

what you shouldn't do is stay quiet abusing the exploit like nothing happened: if you see something weird, tell us. fixing early > exploiting later. and if you knowingly exploit something... remember section 3, the "don't be that guy" one.

## 5. about ai

- **this client was built with a lot of ai help.** code, translations, docs... ai was the copilot. if you find a weird bug... yeah, probably the ai. (or me. who knows?) (¬‿¬)
- **verityai** (the client's assistant) can say nonsense with total confidence. don't treat it as a source of truth, or a lawyer, or a doctor. it's a parrot with internet access.
- if you enable auto-reply, game chat goes through the ai provider. your call.

## 6. updates and crazy updates

the client **auto-updates from github** and can even apply changes on the fly (hotload). translation? sometimes it moves on its own while you're not looking. you can disable it in settings, but then you and the bugs are left alone with the old version. (⌐■_■)

## 7. in short, the deal is:

| us | you |
|---|---|
| we make a free community client, with love and bugs | you use it because you want to, not because you must |
| we warn you about the risks (like right now) | you read the warnings (like right now) and don't sue us |
| we may change or break features whenever we want | you report bugs nicely on discord |
| we're not responsible for bans or what you do with the client | you play fair and don't ruin other people's games |

## 8. the short legal line

the software is provided "as is", no warranties. we're not liable for bans, data loss, damages, or whatever the ai decides to say. the full, boring (but binding) version is in the [full eula](eula.md). if anything in this tl;dr contradicts the full version, the full one wins. always. period. ᕕ( ᐛ )ᕗ

---

thanks for reading this far. seriously. you're one of the readers. (っ˘ω˘ς)

found a bug? have an idea? just want to hang out?
**[discord](https://discord.gg/k4Ku9DTQDQ)**

remember: **nobody is forcing you to use the client, you use it because you want to haha** ᕦ(ò_óˇ)ᕤ
