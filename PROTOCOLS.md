# POLITIK — PROTOCOL LIBRARY

**Attribution:** Steve Krisjanovs, Cordfuse

See [POLITIK-ARCHITECTURE.md](POLITIK-ARCHITECTURE.md) for CANON, session structure, and the engine layer.

---

## PROTOCOL LIBRARY

### DOMAIN: POLITICS & GOVERNANCE

**Protocol: Parliamentary Democracy (reference — ships first)**
| CANON | Term |
|---|---|
| AUTHORITY | Speaker |
| DELEGATE | Deputy Speaker |
| OPERATOR | Minister |
| MEMBER | Backbencher |
| OBSERVER | Gallery |
| SESSION | Parliament |
| CHARTER | Standing Orders |
| RECORD | Hansard |
| MOTION | Tabled Motion |
| DIVISION | Division |
| ESCALATION | Point of Order |
| SUSPENSION | Adjournment |
| DISSOLVE | Prorogation |
| EXIT | Resigned from the House |
| DEADLOCK | Hung Parliament |
| PROMOTE | Appointed to Cabinet |
| DEMOTE | Returned to Backbench |
Mode: Constitutional

**Protocol: Republic (US-style)**
| CANON | Term |
|---|---|
| AUTHORITY | President |
| DELEGATE | Vice President |
| OPERATOR | Secretary / Senator |
| MEMBER | Representative |
| OBSERVER | Constituent |
| SESSION | Congress |
| CHARTER | Constitution |
| RECORD | Congressional Record |
| MOTION | Bill |
| DIVISION | Vote |
| ESCALATION | Filibuster |
| SUSPENSION | Recess |
| EXIT | Impeached / Resigned |
| DEADLOCK | Government Shutdown |
| VETO | Presidential Veto |
Mode: Constitutional (AUTHORITY holds strong VETO)

**Protocol: Socialism / Collective**
| CANON | Term |
|---|---|
| AUTHORITY | Party Chair |
| OPERATOR | Comrade Commissar |
| MEMBER | Worker Delegate |
| OBSERVER | Civilian |
| SESSION | Collective |
| RECORD | Party Record |
| MOTION | Party Directive |
| ESCALATION | Party Challenge |
| EXIT | Sent to Re-education / Purged |
| DEADLOCK | Party Purge |
Mode: Authoritarian (collective in theory, party in practice)

**Protocol: Fascism**
| CANON | Term |
|---|---|
| AUTHORITY | The Leader |
| OPERATOR | Reich Minister |
| MEMBER | Party Member |
| OBSERVER | Subject |
| SESSION | The State |
| RECORD | State Propaganda |
| MOTION | Decree |
| ESCALATION | None — routes back to Leader |
| EXIT | Disappeared / Purged |
| DEADLOCK | Not permitted |
Mode: Authoritarian — no DIVISION, no ESCALATION, AUTHORITY is terminal

**Protocol: Monarchy**
| CANON | Term |
|---|---|
| AUTHORITY | The Crown |
| DELEGATE | Lord Chancellor |
| OPERATOR | Noble / Lord |
| MEMBER | Knight / Subject |
| OBSERVER | Commoner |
| SESSION | Royal Court |
| CHARTER | Royal Decree |
| RECORD | Royal Chronicle |
| MOTION | Petition |
| DIVISION | Royal Assent |
| ESCALATION | Appeal to the Crown |
| EXIT | Banished / Executed |
Mode: Authoritarian with Constitutional elements

---

### DOMAIN: SOFTWARE DEVELOPMENT

**Protocol: Agile / Scrum**
| CANON | Term |
|---|---|
| AUTHORITY | Scrum Master |
| DELEGATE | Tech Lead |
| OPERATOR | Senior Developer |
| MEMBER | Developer |
| OBSERVER | Stakeholder |
| SESSION | Sprint |
| CHARTER | Definition of Done |
| RECORD | Commit Log |
| MOTION | Pull Request |
| DIVISION | Code Review Vote |
| ESCALATION | Blocker |
| SUSPENSION | Sprint Close |
| EXIT | Offboarded |
| DEADLOCK | Merge Conflict |
| PROMOTE | Promoted to Tech Lead |
Mode: Constitutional

**Protocol: Open Source / RFC**
| CANON | Term |
|---|---|
| AUTHORITY | Maintainer / BDFL |
| DELEGATE | Core Contributor |
| OPERATOR | Contributor |
| MEMBER | Community Member |
| OBSERVER | User / Watcher |
| SESSION | RFC Period |
| CHARTER | CONTRIBUTING.md |
| RECORD | Issue / PR History |
| MOTION | RFC / PR |
| DIVISION | Maintainer Approval |
| ESCALATION | Request for Comment |
| SUSPENSION | RFC Closed |
| EXIT | Banned / Removed |
| DEADLOCK | Stalled RFC |
Mode: Constitutional (BDFL holds soft veto)

**Protocol: DevOps / Incident**
| CANON | Term |
|---|---|
| AUTHORITY | Incident Commander |
| DELEGATE | Operations Lead |
| OPERATOR | On-Call Engineer |
| MEMBER | Responder |
| OBSERVER | Stakeholder / Management |
| SESSION | Incident |
| CHARTER | Runbook |
| RECORD | Incident Timeline |
| MOTION | Remediation Action |
| DIVISION | Team Consensus |
| ESCALATION | Escalate to IC |
| SUSPENSION | Incident Resolved |
| EXIT | Handed Off |
| DEADLOCK | Bridge Call Chaos |
Mode: Authoritarian (IC decides unilaterally under pressure)

---

### DOMAIN: SPORTS

**Protocol: League Season**
| CANON | Term |
|---|---|
| AUTHORITY | Commissioner |
| DELEGATE | League Director |
| OPERATOR | Team Captain |
| MEMBER | Roster Player |
| OBSERVER | Fan / Press |
| SESSION | Season |
| CHARTER | Rulebook |
| RECORD | Season Stats / Game Log |
| MOTION | Play Call |
| DIVISION | Referee Decision |
| ESCALATION | Challenge Flag |
| SUSPENSION | Off Season |
| EXIT | Traded / Released |
| DEADLOCK | Tie / Overtime |
Mode: Constitutional

**Protocol: Elimination Tournament (Single)**
| CANON | Term |
|---|---|
| AUTHORITY | Tournament Director |
| SESSION | Tournament |
| CHARTER | Tournament Rules |
| RECORD | Bracket |
| MOTION | Match |
| DIVISION | Match Result |
| ESCALATION | Protest / Appeal |
| SUSPENSION | Bye Round |
| EXIT | Eliminated — bracket closes |
| DEADLOCK | Tiebreaker Round |
| QUORUM | Minimum entrants |
Mode: Darwinist — losers exit permanently, no second chances

**Protocol: Double Elimination**
Same as Single Elimination with:
- EXIT from winners bracket → moves to losers bracket
- EXIT from losers bracket → permanently eliminated
- Two survival chances built into CHARTER

**Protocol: Round Robin**
| CANON | Term |
|---|---|
| AUTHORITY | Tournament Director |
| SESSION | Round Robin Pool |
| MOTION | Match |
| RECORD | Points Table |
| DIVISION | Match Result |
| SUSPENSION | Pool Complete |
| EXIT | Pool Stage Elimination |
| DEADLOCK | Points Tie → Tiebreaker |
Mode: Constitutional — everyone plays everyone, standings decide

**Protocol: Battle Royale**
| CANON | Term |
|---|---|
| AUTHORITY | None during session (Server / Host pre-bakes rules) |
| SESSION | Match |
| CHARTER | Zone Rules / Match Config |
| RECORD | Kill Feed |
| MOTION | Engagement |
| DIVISION | None — no appeals |
| ESCALATION | None — no appeals |
| SUSPENSION | Zone Collapse |
| EXIT | Eliminated |
| QUORUM | Players Remaining |
| DEADLOCK | Final Circle |
Mode: Darwinist — pure statute, no AUTHORITY, no ESCALATION

**Protocol: Swiss System (Chess / Competitive)**
| CANON | Term |
|---|---|
| AUTHORITY | Arbiter |
| SESSION | Swiss Tournament |
| CHARTER | Swiss Rules |
| RECORD | Standings / Pairings |
| MOTION | Round |
| DIVISION | Game Result |
| ESCALATION | Arbiter Ruling Request |
| SUSPENSION | Bye |
| EXIT | Withdrawal |
| DEADLOCK | Draw |
Mode: Constitutional — no elimination, standings accumulate

**Protocol: Draft / Fantasy**
| CANON | Term |
|---|---|
| AUTHORITY | Commissioner |
| SESSION | Draft / Season |
| CHARTER | League Rules |
| RECORD | Draft Board / Roster |
| MOTION | Pick / Trade |
| DIVISION | Trade Vote (if league votes) |
| ESCALATION | Commissioner Review |
| SUSPENSION | Off Season |
| EXIT | Dropped |
| DEADLOCK | Disputed Trade |
Mode: Constitutional with Commissioner VETO

**Protocol: Olympic / Multi-Sport**
| CANON | Term |
|---|---|
| AUTHORITY | IOC / Organizing Committee |
| OPERATOR | Team Chef de Mission |
| MEMBER | Athlete |
| OBSERVER | Press / Spectator |
| SESSION | Games |
| RECORD | Medal Table / Results |
| MOTION | Event |
| DIVISION | Judge Panel Score |
| ESCALATION | Protest / CAS Appeal |
| EXIT | Disqualified / DNF |
| DOMAIN_VETO | Anti-Doping Authority (can void results) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Motorsport / F1**
| CANON | Term |
|---|---|
| AUTHORITY | Race Director |
| DELEGATE | Deputy Race Director |
| OPERATOR | Team Principal |
| MEMBER | Driver |
| OBSERVER | Spectator / Press |
| SESSION | Race Weekend |
| CHARTER | Sporting Regulations |
| RECORD | Lap Times / Race Results |
| MOTION | Pit Strategy Call |
| DIVISION | Stewards Decision |
| ESCALATION | Protest to Stewards |
| SUSPENSION | Safety Car / Red Flag |
| EXIT | DNF / DSQ |
| DEADLOCK | Stewards Under Review |
Mode: Constitutional

**Protocol: eSports Match**
| CANON | Term |
|---|---|
| AUTHORITY | Referee / Admin |
| OPERATOR | Team Captain |
| MEMBER | Player |
| OBSERVER | Caster / Viewer |
| SESSION | Series / Match |
| CHARTER | Ruleset |
| RECORD | Match History / VOD |
| MOTION | In-game call |
| DIVISION | Admin Ruling |
| ESCALATION | Pause / Admin Call |
| SUSPENSION | Technical Pause |
| EXIT | Forfeit / Disqualified |
| DEADLOCK | Remake |
Mode: Constitutional

**Protocol: MMO Raid / Guild**
| CANON | Term |
|---|---|
| AUTHORITY | Guild Master |
| DELEGATE | Officer |
| OPERATOR | Class Lead / Role Lead |
| MEMBER | Member |
| OBSERVER | Trial / Applicant |
| SESSION | Raid / Campaign |
| CHARTER | Guild Rules / Loot Council |
| RECORD | DPS Logs / Raid Report |
| MOTION | Raid Call |
| DIVISION | Loot Vote |
| ESCALATION | Officer Ticket |
| SUSPENSION | Reset / Off Week |
| EXIT | Gkicked |
| DEADLOCK | Loot Drama |
Mode: Constitutional

---

### DOMAIN: MILITARY & SECURITY

**Protocol: Military Operation**
| CANON | Term |
|---|---|
| AUTHORITY | Commanding Officer |
| DELEGATE | Executive Officer |
| OPERATOR | Field Commander |
| MEMBER | Enlisted |
| OBSERVER | Intelligence Liaison |
| SESSION | Operation |
| CHARTER | Rules of Engagement |
| RECORD | After Action Report |
| MOTION | Order |
| DIVISION | None — CO decides |
| ESCALATION | Challenge Up Chain |
| SUSPENSION | Stand Down |
| EXIT | KIA / Relieved of Duty |
| DEADLOCK | Comms Blackout |
Mode: Authoritarian

**Protocol: Intelligence / Espionage**
| CANON | Term |
|---|---|
| AUTHORITY | Station Chief |
| DELEGATE | Handler |
| OPERATOR | Field Officer |
| MEMBER | Asset |
| OBSERVER | None — compartmentalized |
| SESSION | Operation |
| CHARTER | Tradecraft |
| RECORD | None — burn after reading |
| MOTION | Tasking |
| DIVISION | None — unilateral |
| ESCALATION | Flash Traffic to Director |
| EXIT | Burned / Extracted / Eliminated |
Mode: Authoritarian + Ephemeral (no RECORD by design)

**Protocol: Cybersecurity / Red Team**
| CANON | Term |
|---|---|
| AUTHORITY | Security Director |
| DELEGATE | Red Team Lead |
| OPERATOR | Penetration Tester |
| MEMBER | Analyst |
| OBSERVER | Compliance Officer |
| SESSION | Engagement |
| CHARTER | Rules of Engagement |
| RECORD | Findings Report |
| MOTION | Attack Vector |
| DIVISION | Severity Vote |
| ESCALATION | Critical Finding — immediate notify |
| SUSPENSION | Engagement Close |
| EXIT | Out of Scope — cease |
| DOMAIN_VETO | Compliance Officer (can halt engagement) |
Mode: Constitutional with DOMAIN_VETO

---

### DOMAIN: LEGAL & JUSTICE

**Protocol: Criminal Trial**
| CANON | Term |
|---|---|
| AUTHORITY | Judge |
| DELEGATE | Clerk of the Court |
| OPERATOR | Lead Counsel |
| MEMBER | Associate / Paralegal |
| OBSERVER | Jury |
| SESSION | Trial |
| CHARTER | Rules of Evidence |
| RECORD | Court Transcript |
| MOTION | Motion / Objection |
| DIVISION | Verdict |
| ESCALATION | Objection — Sustained / Overruled |
| SUSPENSION | Adjournment |
| EXIT | Struck from Record |
| DEADLOCK | Mistrial |
| DOMAIN_VETO | Jury (holds final Division authority) |
Mode: Constitutional with DOMAIN_VETO inversion

**Protocol: Arbitration**
| CANON | Term |
|---|---|
| AUTHORITY | Arbitrator Panel |
| OPERATOR | Lead Counsel |
| MEMBER | Witness |
| OBSERVER | Interested Party |
| SESSION | Arbitration |
| CHARTER | Arbitration Agreement |
| RECORD | Award |
| MOTION | Submission |
| DIVISION | Panel Decision |
| ESCALATION | None — binding by agreement |
| SUSPENSION | Recess |
| EXIT | Settled / Withdrawn |
Mode: Authoritarian (binding, no appeal by design)

---

### DOMAIN: HEALTHCARE & SCIENCE

**Protocol: Clinical / Hospital**
| CANON | Term |
|---|---|
| AUTHORITY | Chief of Medicine / Attending |
| DELEGATE | Charge Nurse |
| OPERATOR | Specialist / Consultant |
| MEMBER | Resident / Intern |
| OBSERVER | Patient |
| SESSION | Case / Shift |
| CHARTER | Clinical Protocol |
| RECORD | Patient Chart / EMR |
| MOTION | Treatment Order |
| DIVISION | Multidisciplinary Team Vote |
| ESCALATION | Ethics Consultation |
| SUSPENSION | Discharge / End of Shift |
| EXIT | Referred Out |
| DEADLOCK | Ethics Committee Review |
| DOMAIN_VETO | Patient (holds treatment veto) |
Mode: Constitutional with DOMAIN_VETO inversion

**Protocol: Clinical Trial / Research**
| CANON | Term |
|---|---|
| AUTHORITY | Principal Investigator |
| DELEGATE | Lab Manager |
| OPERATOR | Senior Researcher |
| MEMBER | Graduate Student / RA |
| OBSERVER | IRB / Peer Reviewer |
| SESSION | Study |
| CHARTER | Protocol / IRB Approval |
| RECORD | Lab Notebook / Dataset |
| MOTION | Hypothesis / Experiment |
| DIVISION | Peer Review |
| ESCALATION | Protocol Deviation Report |
| SUSPENSION | Publication / Grant End |
| EXIT | Retracted / Dropped |
| DEADLOCK | Replication Crisis |
| DOMAIN_VETO | IRB (can halt study) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Emergency Response / ICS**
| CANON | Term |
|---|---|
| AUTHORITY | Incident Commander |
| DELEGATE | Operations Section Chief |
| OPERATOR | Division Supervisor |
| MEMBER | Unit Leader |
| OBSERVER | Agency Liaison |
| SESSION | Incident |
| CHARTER | ICS Protocol |
| RECORD | Incident Action Plan / ICS-214 |
| MOTION | Tactical Assignment |
| DIVISION | None — IC decides |
| ESCALATION | Safety Officer Override |
| SUSPENSION | Demobilization |
| EXIT | Relieved / Reassigned |
| DOMAIN_VETO | Safety Officer (can override IC on safety) |
Mode: Authoritarian with DOMAIN_VETO safety carve-out

---

### DOMAIN: CREATIVE & ENTERTAINMENT

**Protocol: Film / TV Production**
| CANON | Term |
|---|---|
| AUTHORITY | Director |
| DELEGATE | 1st AD |
| OPERATOR | Department Head (DP, PD) |
| MEMBER | Crew |
| OBSERVER | Studio / Producer |
| SESSION | Shoot / Production |
| CHARTER | Script / Shot List |
| RECORD | Continuity Notes / Edit Log |
| MOTION | Scene / Take |
| DIVISION | None — Director decides |
| ESCALATION | Notes from Studio |
| SUSPENSION | Wrap |
| EXIT | Fired / Walked Off Set |
| DEADLOCK | Creative Differences |
Mode: Authoritarian

**Protocol: Theatre**
| CANON | Term |
|---|---|
| AUTHORITY | Director |
| DELEGATE | Stage Manager |
| OPERATOR | Lead Actor / Designer |
| MEMBER | Cast / Crew |
| OBSERVER | Audience / Producer |
| SESSION | Production / Run |
| CHARTER | Script / Production Bible |
| RECORD | Prompt Book |
| MOTION | Blocking Note / Change |
| DIVISION | Company Vote (rare) |
| ESCALATION | Producer Intervention |
| SUSPENSION | Dark Night / Hiatus |
| EXIT | Recast / Resigned |
| DEADLOCK | Creative Impasse |
Mode: Authoritarian

**Protocol: Music Recording**
| CANON | Term |
|---|---|
| AUTHORITY | Producer |
| DELEGATE | Engineer |
| OPERATOR | Session Lead / Artist |
| MEMBER | Session Musician |
| OBSERVER | A&R / Label |
| SESSION | Recording Session |
| CHARTER | Creative Brief |
| RECORD | Session Log / Stems |
| MOTION | Take |
| DIVISION | Producer Decision |
| ESCALATION | Label Review |
| SUSPENSION | Session End |
| EXIT | Replaced |
| DEADLOCK | Creative Block |
Mode: Authoritarian

**Protocol: Game Development**
| CANON | Term |
|---|---|
| AUTHORITY | Game Director |
| DELEGATE | Lead Designer |
| OPERATOR | Senior Dev / Artist |
| MEMBER | Developer |
| OBSERVER | QA / Publisher |
| SESSION | Milestone / Crunch |
| CHARTER | Game Design Document |
| RECORD | Build Notes / Changelog |
| MOTION | Feature / Change |
| DIVISION | Team Vote |
| ESCALATION | Publisher Review |
| SUSPENSION | Ship / Gold |
| EXIT | Laid Off / Left |
| DEADLOCK | Feature Creep Freeze |
Mode: Constitutional drifting Authoritarian near ship

---

### DOMAIN: BUSINESS & FINANCE

**Protocol: Corporate / Board**
| CANON | Term |
|---|---|
| AUTHORITY | CEO / Chair |
| DELEGATE | COO |
| OPERATOR | VP / Director |
| MEMBER | Manager |
| OBSERVER | Shareholder |
| SESSION | Board Meeting / Quarter |
| CHARTER | Corporate Policy |
| RECORD | Minutes |
| MOTION | Proposal / Initiative |
| DIVISION | Board Vote |
| ESCALATION | Escalation to Legal / Board |
| SUSPENSION | End of Quarter |
| EXIT | Resigned / Terminated |
| DEADLOCK | Board Deadlock |
| PROMOTE | Promoted to VP |
| DOMAIN_VETO | Shareholder (special resolution veto) |
Mode: Constitutional

**Protocol: Startup**
| CANON | Term |
|---|---|
| AUTHORITY | Founder / CEO |
| OPERATOR | CTO / Lead |
| MEMBER | Employee |
| OBSERVER | Investor / VC |
| SESSION | Sprint / Launch |
| CHARTER | Move Fast, Break Things |
| RECORD | Slack Archive nobody reads |
| MOTION | Shipped Feature |
| DIVISION | Founder decides unilaterally |
| ESCALATION | None |
| SUSPENSION | Pivot |
| EXIT | Quit / Acqui-hired |
| DEADLOCK | Co-founder Dispute |
Mode: Authoritarian (structurally close to Fascism)

**Protocol: Investment / Trading**
| CANON | Term |
|---|---|
| AUTHORITY | Portfolio Manager / CIO |
| DELEGATE | Senior Analyst |
| OPERATOR | Analyst |
| MEMBER | Junior Analyst |
| OBSERVER | Risk Committee |
| SESSION | Investment Thesis |
| CHARTER | Investment Policy Statement |
| RECORD | Trade Log / Blotter |
| MOTION | Trade Recommendation |
| DIVISION | Committee Vote |
| ESCALATION | Risk Committee Override |
| SUSPENSION | Market Close / Halt |
| EXIT | Position Closed / Fired |
| DOMAIN_VETO | Risk Committee (can block trade) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Auction House**
| CANON | Term |
|---|---|
| AUTHORITY | Auctioneer |
| MEMBER | Bidder |
| OBSERVER | Spectator |
| SESSION | Auction |
| CHARTER | Auction Rules |
| RECORD | Bid Log |
| MOTION | Bid |
| DIVISION | Hammer Fall |
| ESCALATION | None — Auctioneer final |
| SUSPENSION | Lot Withdrawn |
| EXIT | Reserve Not Met / Won |
| DEADLOCK | Tied Bids |
Mode: Darwinist — rules pre-baked, Auctioneer is referee not participant

---

### DOMAIN: EDUCATION & ACADEMIA

**Protocol: Academic / University**
| CANON | Term |
|---|---|
| AUTHORITY | Dean / Department Chair |
| DELEGATE | Faculty Lead |
| OPERATOR | Professor |
| MEMBER | Graduate Student |
| OBSERVER | Undergraduate / Auditor |
| SESSION | Semester / Term |
| CHARTER | Syllabus / Academic Code |
| RECORD | Academic Record |
| MOTION | Assignment / Research Task |
| DIVISION | Faculty Vote |
| ESCALATION | Academic Review Board |
| SUSPENSION | End of Term |
| EXIT | Expelled / Withdrew |
| DEADLOCK | Committee Stalemate |
Mode: Constitutional

**Protocol: Debate Competition**
| CANON | Term |
|---|---|
| AUTHORITY | Chief Adjudicator |
| DELEGATE | Panel Chair |
| OPERATOR | Adjudicator |
| MEMBER | Debater |
| OBSERVER | Audience |
| SESSION | Tournament / Round |
| CHARTER | Debate Rules / Format |
| RECORD | Adjudication Notes |
| MOTION | Motion / Resolution |
| DIVISION | Adjudicator Decision |
| ESCALATION | Chief Adjudicator Appeal |
| SUSPENSION | Break / Final |
| EXIT | Eliminated |
Mode: Constitutional

---

### DOMAIN: COMMUNITY & SOCIAL

**Protocol: Organized Crime / Syndicate**
| CANON | Term |
|---|---|
| AUTHORITY | Boss / Don |
| DELEGATE | Underboss |
| OPERATOR | Capo |
| MEMBER | Soldier |
| OBSERVER | Associate |
| SESSION | Job / Operation |
| CHARTER | The Code / Omertà |
| RECORD | None — ever |
| MOTION | Order |
| DIVISION | None — Boss decides |
| ESCALATION | None |
| EXIT | Whacked / Flipped |
| DEADLOCK | War |
Mode: Authoritarian + Ephemeral

**Protocol: Religion / Church**
| CANON | Term |
|---|---|
| AUTHORITY | Pope / Bishop / Imam |
| DELEGATE | Vicar / Deacon |
| OPERATOR | Priest / Elder |
| MEMBER | Congregation |
| OBSERVER | Seeker / Visitor |
| SESSION | Mass / Synod / Council |
| CHARTER | Canon Law / Scripture (immutable) |
| RECORD | Scripture / Encyclical |
| MOTION | Decree / Proclamation |
| DIVISION | Council Vote / Synod |
| ESCALATION | Holy See / Fatwa |
| SUSPENSION | Benediction |
| EXIT | Excommunicated |
| DEADLOCK | Schism |
Mode: Immutable (Scripture cannot be amended mid-session)

**Protocol: Neighbourhood / HOA**
| CANON | Term |
|---|---|
| AUTHORITY | Board President |
| DELEGATE | Vice President |
| OPERATOR | Committee Chair |
| MEMBER | Homeowner |
| OBSERVER | Renter / Tenant |
| SESSION | AGM / Meeting |
| CHARTER | CC&Rs / Bylaws |
| RECORD | Meeting Minutes |
| MOTION | Resolution |
| DIVISION | Member Vote |
| ESCALATION | Legal Counsel Review |
| SUSPENSION | Meeting Adjourned |
| EXIT | Sold / Left Community |
| DEADLOCK | Tied Vote — Chair decides |
Mode: Constitutional

---

### DOMAIN: NOVEL / UNCONVENTIONAL

**Protocol: Hackathon**
| CANON | Term |
|---|---|
| AUTHORITY | Organizer / Judge Panel |
| OPERATOR | Team Lead |
| MEMBER | Hacker |
| OBSERVER | Sponsor / Mentor |
| SESSION | Hackathon |
| CHARTER | Hackathon Rules |
| RECORD | Submission Log |
| MOTION | Feature / Build |
| DIVISION | Judge Score |
| ESCALATION | Mentor Consultation |
| SUSPENSION | Time's Up |
| EXIT | Withdrew / Disqualified |
| DEADLOCK | Tie — judges deliberate |
Mode: Darwinist — clock governs, no appeals during build phase

**Protocol: Improv Theatre**
| CANON | Term |
|---|---|
| AUTHORITY | Director / Harold |
| OPERATOR | Ensemble Lead |
| MEMBER | Performer |
| OBSERVER | Audience |
| SESSION | Show / Set |
| CHARTER | Improv Rules ("Yes, And") |
| RECORD | None — ephemeral by nature |
| MOTION | Scene Offer |
| DIVISION | Group Acceptance |
| ESCALATION | Director Side-door |
| SUSPENSION | End of Show |
| EXIT | Edited Out |
| DEADLOCK | Scene Stalls — director edits |
Mode: Darwinist + Ephemeral (no record, rules pre-baked)

**Protocol: Archaeological Dig**
| CANON | Term |
|---|---|
| AUTHORITY | Principal Archaeologist |
| DELEGATE | Site Supervisor |
| OPERATOR | Field Director |
| MEMBER | Field Technician |
| OBSERVER | Funder / Heritage Authority |
| SESSION | Excavation Season |
| CHARTER | Site Research Design |
| RECORD | Site Archive / Context Sheets |
| MOTION | Excavation Decision |
| DIVISION | Team Consensus |
| ESCALATION | Heritage Authority Notification |
| SUSPENSION | Season Close / Backfill |
| EXIT | Permit Revoked / Left Site |
| DOMAIN_VETO | Heritage Authority (can halt dig) |
Mode: Constitutional with DOMAIN_VETO

**Protocol: Jury Deliberation**
| CANON | Term |
|---|---|
| AUTHORITY | Foreperson |
| MEMBER | Juror |
| SESSION | Deliberation |
| CHARTER | Jury Instructions |
| RECORD | None — deliberations sealed |
| MOTION | Argument |
| DIVISION | Verdict Vote |
| ESCALATION | Note to Judge |
| SUSPENSION | Recess |
| EXIT | Dismissed / Replaced |
| DEADLOCK | Hung Jury |
Mode: Constitutional + Ephemeral (record sealed)

**Protocol: Antarctic Expedition**
| CANON | Term |
|---|---|
| AUTHORITY | Expedition Leader |
| DELEGATE | Deputy Leader |
| OPERATOR | Senior Scientist |
| MEMBER | Crew / Junior Scientist |
| OBSERVER | Base Commander |
| SESSION | Expedition Season |
| CHARTER | Station Protocol / Safety Rules |
| RECORD | Station Log |
| MOTION | Field Decision |
| DIVISION | Team Vote |
| ESCALATION | Emergency Protocol |
| SUSPENSION | Evacuation / Winter-Over |
| EXIT | Medically Evacuated |
| DEADLOCK | Comms Blackout Protocol |
Mode: Immutable (safety rules non-negotiable, no amendment mid-session)

**Protocol: Pirate Crew**
| CANON | Term |
|---|---|
| AUTHORITY | Captain |
| DELEGATE | First Mate |
| OPERATOR | Quartermaster |
| MEMBER | Crew |
| OBSERVER | Prisoner / Passenger |
| SESSION | Voyage |
| CHARTER | Articles (crew contract) |
| RECORD | Ship's Log |
| MOTION | Ship's Council Proposal |
| DIVISION | Crew Vote |
| ESCALATION | Mutiny Vote |
| SUSPENSION | Made Port |
| EXIT | Marooned / Walked the Plank |
| DEADLOCK | Contested Command |
Mode: Constitutional (historically pirates were surprisingly democratic)

---

### DOMAIN: SCIENTIFIC RESEARCH

Scientific Research deserves its own domain — not just a protocol under Healthcare & Science. Different research paradigms are literally different governance structures for how knowledge gets validated. The protocol IS the epistemology.

This domain is unique: **every protocol here was designed by humans specifically to overcome known cognitive biases and incentive problems in knowledge production.** They were already mechanism-designed by centuries of scientific practice. Politik formalises and automates what science already knew it needed.

This also makes the Nash Eq analysis particularly clean — the game structures are not hypothetical. They are what real science has converged on through centuries of trial and error.

**Protocol: Peer Review**
| CANON | Term |
|---|---|
| AUTHORITY | Editor / Programme Chair |
| DELEGATE | Associate Editor |
| OPERATOR | Reviewer |
| MEMBER | Author |
| OBSERVER | Scientific Community |
| SESSION | Review Cycle |
| CHARTER | Review Criteria / Journal Standards |
| RECORD | Review History / Decision Log |
| MOTION | Submission |
| DIVISION | Accept / Reject / Major Revision |
| ESCALATION | Appeal to Editor-in-Chief |
| SUSPENSION | Decision Issued |
| EXIT | Withdrawn / Desk Rejected |
| DEADLOCK | Split Decision — additional reviewer assigned |
| DOMAIN_VETO | Statistical Reviewer (can reject on methodology alone) |

Mode: Constitutional
Special configuration: `operator_identity: anonymous` — Reviewer identities sealed by Charter.
Nash Eq: Honest assessment when reviewer anonymity is credible and reputation effects apply.

---

**Protocol: Adversarial Collaboration**
| CANON | Term |
|---|---|
| AUTHORITY | Independent Arbitrator |
| OPERATOR | Proponent Agent |
| OPERATOR | Opponent Agent |
| OBSERVER | Scientific Community |
| SESSION | Collaboration |
| CHARTER | Pre-registered Agreement (immutable — both parties commit before data collection) |
| RECORD | Joint Report |
| MOTION | Experimental Run |
| DIVISION | Result Interpretation |
| ESCALATION | Arbitrator Ruling |
| SUSPENSION | Joint Publication |
| EXIT | Protocol Violation — arbitrator intervenes |
| DEADLOCK | Genuinely ambiguous result — documented as such |

Mode: Constitutional + Immutable Charter
Note: Both OPERATOR agents must commit to accepting the result before the session begins. The Charter cannot be amended after the experiment starts. Formal epistemological solution to confirmation bias.
Nash Eq: Both agents converge on honest reporting because defection is contractually penalised and publicly recorded.

---

**Protocol: Replication Crisis**
| CANON | Term |
|---|---|
| AUTHORITY | Replication Director |
| OPERATOR | Original Study Agent |
| OPERATOR | Replication Agent |
| OPERATOR | Meta-analyst Agent |
| OBSERVER | Field Community |
| SESSION | Replication Study |
| CHARTER | Exact Replication Protocol |
| RECORD | Replication Log |
| MOTION | Experimental Run |
| DIVISION | Replication Success / Failure Vote |
| ESCALATION | Discrepancy Report — original authors notified |
| SUSPENSION | Replication Report Published |
| EXIT | Retracted / Finding Does Not Replicate |
| DEADLOCK | Partial replication — conditional survival |

Mode: Darwinist
Note: The finding either survives or dies. No negotiation. The Charter mandates exact replication — no methodological flexibility. The harshest protocol in the Scientific Research domain.
Nash Eq: Replication Agent maximises honest reporting — reputation depends on accuracy not on confirming or denying the original.

---

**Protocol: Pre-registration / Open Science**
| CANON | Term |
|---|---|
| AUTHORITY | Registry / IRB |
| OPERATOR | Principal Investigator Agent |
| MEMBER | Research Team Agent |
| OBSERVER | Public / Peer Community |
| SESSION | Research Study |
| CHARTER | Pre-registered Protocol (immutable after registration) |
| RECORD | Open Lab Notebook / Dataset |
| MOTION | Hypothesis / Experimental Design |
| DIVISION | IRB Approval |
| ESCALATION | Protocol Deviation Report |
| SUSPENSION | Publication |
| EXIT | Study Terminated / Hypothesis Abandoned |
| DEADLOCK | IRB Review Required |
| DOMAIN_VETO | IRB (can halt study at any point) |

Mode: Immutable
Note: The Charter is locked at registration. Any deviation is automatically logged as a Standing Orders violation and escalated. Prevents p-hacking and HARKing (Hypothesising After Results are Known) by architectural constraint not honour system.
Nash Eq: Agents converge on honest null result reporting — cherry-picking is structurally prevented.

---

**Protocol: Grand Challenge**
| CANON | Term |
|---|---|
| AUTHORITY | Challenge Organiser / Prize Committee |
| OPERATOR | Team Lead Agent |
| MEMBER | Team Member Agent |
| OBSERVER | Scientific Community / Public |
| SESSION | Challenge Period |
| CHARTER | Problem Definition + Evaluation Criteria |
| RECORD | Submission Log / Leaderboard |
| MOTION | Solution Submission |
| DIVISION | Evaluation Committee Scoring |
| ESCALATION | Submission Dispute |
| SUSPENSION | Challenge Close / Winner Declared |
| EXIT | Withdrew / Disqualified |
| DEADLOCK | No valid submission — challenge extended or abandoned |
| QUORUM | Minimum valid submissions |

Mode: Darwinist
Note: Teams work in competitive isolation. No collaboration between constituencies. Charter defines the problem completely before the session starts. Inspired by Hilbert's Problems, Millennium Prize Problems, DARPA Grand Challenges.
Nash Eq: Each team maximises solution quality independently. No incentive to share. Coalition formation is a Charter violation.

---

**Protocol: Red Team / Blue Team Science**
| CANON | Term |
|---|---|
| AUTHORITY | Scientific Referee / Programme Director |
| OPERATOR | Red Team Lead (mandate: falsify) |
| MEMBER | Red Team Agent |
| OPERATOR | Blue Team Lead (mandate: defend) |
| MEMBER | Blue Team Agent |
| OBSERVER | Scientific Community |
| SESSION | Adversarial Review |
| CHARTER | Rules of Engagement |
| RECORD | Attack / Defence Log |
| MOTION | Attack Vector / Defence Response |
| DIVISION | Referee Ruling per attack |
| ESCALATION | Disputed ruling — senior referee |
| SUSPENSION | Review Complete — theory survives or falls |
| EXIT | Theory falsified — Red Team wins |
| DEADLOCK | Inconclusive — further experimentation required |
| DOMAIN_VETO | Referee (can declare attack line out of scope) |

Mode: Authoritarian/Adversarial hybrid
Note: Red Team has a mandate to falsify. Blue Team has a mandate to defend. The Referee governs scope. Closest to the Legal/Adversarial protocol but applied to scientific epistemology. How frontier physics actually works informally — now formalised.
Nash Eq: Red Team converges on strongest possible attack. Blue Team converges on complete evidence disclosure. Both behaviours serve scientific truth even though agents' goals are opposed.

---

### Game Theory Analysis — Scientific Research Domain

| Protocol | Game Structure | Nash Eq Prediction |
|---|---|---|
| Peer Review | Multi-player review with information asymmetry | Honest assessment when anonymity is credible |
| Adversarial Collaboration | Binding commitment game | Honest reporting — defection contractually costly |
| Replication Crisis | Elimination game | Honest replication — reputation at stake |
| Pre-registration | Commitment device game | Null result reporting — cherry-picking structurally prevented |
| Grand Challenge | All-pay auction | Maximum solution quality — no incentive to hold back |
| Red Team / Blue Team | Zero-sum adversarial game | Maximum attack strength and maximum defence completeness |

---

Politik did not design around GitHub. GitHub accidentally IS a Politik session.

| Politik Primitive | GitHub Feature |
|---|---|
| Session / Politik | Repository |
| Writ Drop | Repo created from template |
| Standing Orders | CHARTER.md + Wiki |
| Hansard entry | Commit |
| Motion | Pull Request |
| Division vote | PR Review (Approve / Request Changes) |
| Motion Carried | PR Merged |
| Motion Defeated | PR Closed |
| Point of Order | Issue |
| Speaker Ruling | Issue Comment + Close |
| Debate | Discussion |
| Resolution | Discussion Answer |
| Parliamentary sitting | Milestone |
| Procedural status | Label |
| Order Paper | GitHub Projects board |
| Constituency join | Repo collaborator access |
| Actor mandate | CODEOWNERS entry |
| Quorum enforcement | Required reviewers (branch protection) |
| Standing Order enforcement | Branch protection rules |
| Speaker notification | GitHub Actions + email |
| Clerk automation | GitHub Actions workflows |
| Speaker credentials | Repository secrets |
| Sub-session / Committee | Branch |
| Committee reports back | Branch merged to main |
| Schism | Fork |
| Prorogation | Milestone closed + repo archived |

---

