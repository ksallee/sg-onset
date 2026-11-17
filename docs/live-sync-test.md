# Live sync test

For Kevin, on a real Flow PT site. The tests only ran against the fake site in `src/lib/fpt/fakeFpt.ts`.
Use a test project on the site, never a show.

## Before

- The site has the six custom entities enabled for projects, named exactly **Take**, **Lens**,
  **Camera Setup**, **Lighting Setup**, **Set Reference** and **Set Shot**. Set Reference and Set
  Shot are optional: try without each once (Also try, **Without Set Reference** and **Without Set
  Shot**). ShootDay, Slate and Camera are switched on.
- You can create fields on the site (Admin), or an Admin is at hand.
- The site's field Trash is empty: a retired field still holds its name until then.

## Steps

1. `pnpm dev`, open `http://localhost:5173` in Chrome. Load the sample project or make a new one.
   A new one is cleaner: the sample's takes are many.
2. Tap the sync status. It says **Not signed in**. Tap **Sign In**, type the site, approve SG OnSet
   on the site, come back. The status says **Not linked**.
3. Open the sync sheet. Under **Flow PT Project**, tap **Link a Project** and pick the test project.
   Check the list: no templates, no demo show.
4. The check runs at once and only reads. Under **Setup**, read the report:
   - **Entities**: all nine found. If one says "Enable a custom entity, name it …", the name is
     what the app looks for.
   - **Fields**: on a fresh site most are **To create**. Nothing has been created yet: check the
     site's fields of Take, nothing new.
   - **Fields Flow PT Adds**: one line per link field, each **Will appear**. Flow PT adds a field
     on the linked entity for every link field (corpus findings/142). Expect, on a site that calls
     the entities as above: `sg_takes` on Slate, Camera, Lens and Camera Setup; `sg_camera_setups`
     on Camera and Lens; `sg_slates` on Shoot Day and Lighting Setup; `sg_set_references` on Slate;
     on Slate `custom_entityNN_sg_slates_custom_entityNNs`, shown **Set References <-> Slates**,
     with the Set Reference's slot number; on Attachment (File)
     `custom_entityNN_sg_photos_custom_entityNNs`, with the Take's slot
     number, and `slate_sg_setup_diagram_slates`; on Shot `slate_sg_shots_slates`, shown
     **Slates <-> Shots**, and `custom_entityNN_sg_shots_custom_entityNNs`, shown
     **Set Shots <-> Shots**, with the Set Shot's slot number; and on Set Shot
     `slate_sg_set_shots_slates`, shown **Slates <-> Set Shots**. A link that would
     add a name an entity already has is under **Cannot be made yet**, naming that field: nothing
     was created for it.
5. Tap **Set Up Fields**. The report says **Created** for each, and every **Fields Flow PT Adds**
   line says **There**. Open Slate's fields in Flow PT: **Take <-> Slate** (`sg_takes`) is there.
   Do not delete any of these: deleting one deletes our link field too. Tap **Check Setup** again:
   nothing changes, nothing is created.
   - Signed in as an Artist (or any account that may not create fields), **Set Up Fields** stops
     at the first field. The footer says "This Flow PT account cannot create fields. An Admin must
     run Set Up Fields." and **Need an admin** counts the fields. Only one field create was tried.
     If you can, try it with a Manager and a Vendor account and note what happens: those two are
     not measured (README gaps).
6. The status says **Syncing n**, then **All synced**. **Last sync** says now.
7. On Shoot: make a shoot day, a slate, a take with Start and End, and a photo. Watch the status
   count go up and back to **All synced**.
8. Edit a field of that take, tick and untick **Circled**. Each lands, with no **Needs attention**.
9. Turn Wi-Fi off. Capture a take: nothing waits. The status says **Offline** and counts. Wi-Fi on:
   it drains by itself.
10. Make two Shots in the test project in Flow PT, say `TST_010_0010` and `TST_010_0020`. On a
    slate, tap **VFX shots** and type `tst_010`: both codes show as chips under the field. Tap one:
    it is saved. Add a third code no Shot has, `TST_010_0099`. The sync sheet lists nothing under
    **VFX shots to check**: a code with no Shot is filed as a Set Shot, which is expected. Turn
    Wi-Fi off: the field shows no chips and takes any text.
11. On the slate of step 7, open **Setup Diagram**: camera A stands along the foot with its lens and
    view. Drag it, place a light, tap **Done**. The status counts one more and drains: the image is
    drawn as the sync runs. Open the diagram again and move the light; tap **Done**.
12. Give two slates the same lighting setup. On the first, add an **HDRI 360** and a **Lidar scan**.
    Both slates list the HDRI, the second with "Logged on" the first; only the first lists the
    scan. Make a third slate on that lighting setup: it lists the HDRI too.

## In Flow PT

- Shoot Day, Slate, Camera rows in the test project, each with **Onset UUID** filled.
- A Take row: Name is the take number, **Slate** links the slate, **Start Time** and **End Time**
  to the second, **Date Created** equal to the start time, **Circled** as set.
- **Photos** on the take holds one Attachment named `onset_<photo>_<file>.jpg`, display name
  `Photo <time>`. Open it: full resolution, the same size as on the iPad.
- No duplicate rows after step 9.
- The slate of step 10: **Shots** links the two Shots, **VFX Shots** holds all three codes as
  typed, **Set Shots** links three Set Shots. Open one of the Shots: **Slates <-> Shots** lists
  the slate, **Set Shots <-> Shots** its Set Shot. No new Shot was made.
- Set Shot rows in the test project, one per code typed, never two for one code: Name is the code
  as first typed, **Onset Key** is `<project id>:<code in lower case>`, **Shots** links the Shot
  of that code, or nothing for `TST_010_0099`. **Onset Matched** is ticked on those the app
  linked. **Slates <-> Set Shots** lists the slates.
- The slate of step 11: **Setup Diagram** holds one Attachment, `onset_diagram_<slate>_<file>.png`,
  display name `Setup diagram`, the second drawing: the light where you left it. The first image is
  still a File in the project, off the slate's field. Open it: 1600 by 1200, white, the cameras with
  their view. Note the name Flow PT gave the field it added on Attachment for **Setup Diagram**: it
  is predicted, not measured, for a built-in entity (README gaps).
- The Set References of step 12: the HDRI's **Slate** is the first slate, its **Slates** the three
  slates of the lighting setup. The scan's **Slates** is the first slate alone. Each slate's
  **Set References <-> Slates** lists what it shows. Link another slate to the HDRI's **Slates** in
  Flow PT and sync: it is gone. Delete the first slate in the app and sync: the HDRI's **Slate** is
  now the second slate, the scan is deleted with the first.

## Also try

- Edit the same take field in Flow PT and in the app, then sync: **Needs attention**, both values
  shown, **Keep Mine** and **Keep Flow PT's** each settle it.
- Sign out: the status says **Not signed in**, capture goes on, nothing is sent.
- Leave the app signed in for a day: the session ends; the status says **Sign in to sync**.
- A second project on the device: its changes stay on the device until it is linked and current.
- **Permission report.** With the fields set up, sign in as an Artist and capture a take. The
  take needs attention with "This Flow PT account can't create Takes. Ask an Admin for the
  permission." (an Artist may not create custom-entity rows, findings/143). The next take waits
  with the same words and is not sent again this session. Delete a photo as an Artist: "can't
  delete Photos". Shoot days, slates and cameras follow the account's own rights.
- Leave the sync sheet open past ten minutes of syncing: no **Sign in to sync**. The bearer is
  renewed a minute before it ends.
- **Shot links.** Make the Shot `TST_010_0099` in Flow PT, wait a minute, tap **Sync Now**: its
  Set Shot links it, and so does the slate. Take a code off the slate: its Set Shot and its Shot
  are unlinked from the slate; the Set Shot stays.
- **The slate follows its Set Shots.** The slate's **Shots** is worked out at each sync from its Set
  Shots. Link the slate to another Shot by hand in Flow PT, wait a minute, tap **Sync Now**: that
  link is gone. To fix a wrong link, edit the Set Shot, not the slate.
- **Set Shot by hand.** Type `TST_020_0010` on a slate, with no Shot of that code. In Flow PT,
  set the Set Shot's **Shots** to any Shot. Wait a minute, tap **Sync Now**: the slate links that
  Shot. Rename the Set Shot: the next slate with `TST_020_0010` links the same row.
- **A wrong match.** Empty a Set Shot's **Shots** that the app filled (**Onset Matched** is
  ticked). Type its code on a new slate, on another iPad if you have one, and sync: the Set Shot
  stays empty, and the slates that list its code lose that Shot at the next sync.
- **Without Set Shot.** On a test site without the Set Shot slot, link and check: Setup says
  **Ready to sync**, and Set Shot reads "Optional. To use it, enable a custom entity, name it Set
  Shot". Capture a slate with VFX shot codes: it syncs, its codes stay as text, and the sync sheet's
  **Set Shots** section counts it under **Slates waiting**. Enable the slot, tap **Set Up Fields**,
  then **Sync Now**: the Set Shots appear, linked, and the section goes.
- **Without Set Reference.** On a test site without the Set Reference slot, link and check: Setup
  says **Ready to sync**, and Set Reference reads "Optional. To use it, enable a custom entity, name
  it Set Reference". Log an HDRI 360 and a scan on a slate of a lighting setup with two slates, and
  capture a take: the slates and the take sync, the status says **All synced, 2 waiting**, **Waiting,
  by kind** lists the two references, and the sync sheet's **Set References** section counts 2 under
  **References waiting**. Nothing needs attention. With **Notes on Shots** on, the Shot's Note has no
  References. Enable the slot, tap **Set Up Fields**, then **Sync Now**: the two Set References
  appear, the HDRI's **Slates** holds both slates, the section goes, the status says **All synced**,
  and the Note gets a Reply adding the references.
- **Two Shots, one code.** Make two Shots `TST_030_0010`, a code not typed yet. Type it on a new
  slate: the slate and its new Set Shot link both, and the sync sheet lists the code as **Several
  Shots**. Delete one of the two in Flow PT, wait a minute, tap **Sync Now**: the line goes. A
  Shot made later for a code whose Set Shot already holds one is not added: set it by hand.
- **Notes on Shots (#97).** Set Up Fields first: it adds **Onset Key** (unique) and **Onset
  Captured** on Note. In Flow PT give the Shot `TST_010_0010` a Task assigned to an Artist, and a
  second Task assigned to a Group with two Artists. In the sync sheet turn **Notes on Shots** on
  and tap **Sync Now**. The Shot gets one Note, **Set data for TST_010_0010**, from you, linked to
  the Shot and its two Tasks, to the Artist and the Group. Note who Flow PT names as its author,
  whether it is on the Shot's activity stream, and whether it is in each Artist's Inbox (the corpus
  measured none of these with the app's session, README gap 12). Tap **Sync Now** again: nothing
  changes, no Reply. Capture a take on the slate and sync: the same Note says the new take, and a
  Reply says what was added; the Artists see the Note unread again and the Reply in the stream.
  Assign a third person to a Task and capture another take: they are added to **To**, nobody is
  taken off. Turn the setting off: no Note is written or changed.
- **Send set data to artists (#106).** Needs the app on an address Flow PT's browser can reach:
  the deploy, or `pnpm dev` on the laptop that runs the browser. Link the project, tap **Set Up
  Fields**: **Flow PT action** says **Added** on Shot and Set Shot, and names the address. In Flow
  PT, sync a slate with the code `TST_040_0010` while no Shot has it, then make that Shot and give
  it a Task assigned to an Artist. Select the Shot, open the menu (right-click), pick **Send set
  data to artists**. A tab opens on SG OnSet's **Send Set Data**: its address holds the site, the
  project, the type and the ids only. Signed out, it asks to sign in to that site first. It names
  the project and the Shot and says what Send will do; nothing changes in Flow PT until **Send**.
  After Send: the Set Shot holds the Shot, the slate's **Shots** holds it, the Shot has its Note,
  to the Artist, and the page says so per Shot. Run it again: nothing new. Select the Set Shot
  instead and run it: the same, from the other side. Note which browser you used, and try Safari:
  the corpus measured Chrome only (README gap 20).
- A photo: in Flow PT, open the file's link in a new tab. It shows as an image, not a download
  of `binary/octet-stream`. Two photos on one take: **Photos** holds both.
- **Videos (#94).** Once the probe of a Version on a custom entity row has reported (fpt README,
  gap 7). Set Up Fields first: it adds **Onset UUID** on Version. In the take sheet, **Add Photos
  or Videos**: one short clip and one over 100 MB. The large one gets a notice with its size and
  goes up in parts. In Flow PT, the Take's Versions show two, named
  `Video <time>`, with **Link** the take, the file `onset_video_<photo>_<file>.mov` in
  **Uploaded Movie**, and the player plays each once transcoded. **Photos** on the take does not
  hold them. Delete one in the app: its Version goes. Note how long the large one took.
- **Audio notes (#89).** On the iPad in Safari, and in Chrome on a laptop. In the take sheet,
  **Record Audio Note**: allow the microphone, speak ten seconds, **Save Audio Note**. It plays in
  the sheet. Make a second one and close the sheet while it runs: it is kept. In Flow PT, the
  Take's Versions show `Audio note <time>`, the file `onset_audio_<note>_<file>.m4a` from Safari
  (`.webm` from a browser with no AAC) in **Uploaded Movie**, no thumbnail (findings/152). Note
  whether the web player plays it once transcoded, and the type Safari wrote (the file's
  extension). Lock the screen while one runs: say whether it was kept.
- **Two devices on one show (#110).** Set Up Fields first: it adds **Onset Templates** and
  **Onset Reference Kinds** on Project. On device A, add a camera, two lenses, a lighting setup, a
  template and a reference kind, and sync. On device B (another browser, or the laptop), make a
  project, link it to the same Flow PT project and sync: B has all of them, and no slate or take
  of A. Rename a lens on B and sync B, then **Sync Now** on A: A shows the new name. On B delete
  the other lens and the kind, sync B, then A: both are gone on A. Give A a camera setup with the
  first lens, delete that lens on B, sync B then A: A keeps it under **Kept on this device** in the
  sync sheet, and after one more sync on A it is back in Flow PT and on B. In Flow PT, open the
  Project's fields: the two hold JSON. A's takes of that lens and the setup link the lens's new row
  (fpt README, decision 74). Say whether a Manager account may write the two fields (gap 22).
- **Camera setups on two devices (#110).** A has setups A and B, B makes setup C. After both sync,
  Gear on each shows A, B and C; A's are ticked on A only, C on B only. On B tick A: the take screen
  on B shows A and C, and Start makes takes on those. On B change the lens on setup A and sync,
  then **Sync Now** on A: the sync sheet on A lists the setup under **Changed on another device**
  with the field; tapping it opens the setup in Gear and the row goes.

## What to send back

The status at each step, any **Needs attention** with its words, and anything in Flow PT that
does not match the list above.
