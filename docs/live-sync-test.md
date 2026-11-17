# Live sync test

For Kevin, on a real Flow PT site. The tests only ran against the fake site in `src/lib/fpt/fakeFpt.ts`.
Use a test project on the site, never a show.

## Before

- The site has the six custom entities enabled for projects, named exactly **Take**, **Lens**,
  **Camera Setup**, **Lighting Setup**, **Set Reference** and **Set Shot**. Set Shot is optional:
  try without it once (Also try, **Without Set Shot**). ShootDay, Slate and
  Camera are switched on.
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
     on Attachment (File) `custom_entityNN_sg_photos_custom_entityNNs`, with the Take's slot
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
- **Two Shots, one code.** Make two Shots `TST_030_0010`, a code not typed yet. Type it on a new
  slate: the slate and its new Set Shot link both, and the sync sheet lists the code as **Several
  Shots**. Delete one of the two in Flow PT, wait a minute, tap **Sync Now**: the line goes. A
  Shot made later for a code whose Set Shot already holds one is not added: set it by hand.
- A photo: in Flow PT, open the file's link in a new tab. It shows as an image, not a download
  of `binary/octet-stream`. Two photos on one take: **Photos** holds both.
- **Videos (#94).** Once the probe of a Version on a custom entity row has reported (fpt README,
  gap 7). Set Up Fields first: it adds **Onset UUID** on Version. In the take sheet, **Add Photos
  or Videos**: one short clip and one over 100 MB. The large one gets a notice with its size and
  goes up in parts. In Flow PT, the Take's Versions show two, named
  `Video <time>`, with **Link** the take, the file `onset_video_<photo>_<file>.mov` in
  **Uploaded Movie**, and the player plays each once transcoded. **Photos** on the take does not
  hold them. Delete one in the app: its Version goes. Note how long the large one took.

## What to send back

The status at each step, any **Needs attention** with its words, and anything in Flow PT that
does not match the list above.
