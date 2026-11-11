# Live sync test

For Kevin, on a real Flow PT site. The tests only ran against the fake site in `src/lib/fpt/fakeFpt.ts`.
Use a test project on the site, never a show.

## Before

- The site has the four custom entities enabled for projects, named exactly **Take**, **Lens**,
  **Camera Setup** and **Lighting Setup**. ShootDay, Slate and Camera are switched on.
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
   - **Entities**: all seven found. If one says "Enable a custom entity, name it …", the name is
     what the app looks for.
   - **Fields**: on a fresh site most are **To create**. Nothing has been created yet: check the
     site's fields of Take, nothing new.
   - **Fields Flow PT Adds**: one line per link field, each **Will appear**. Flow PT adds a field
     on the linked entity for every link field (corpus findings/142). Expect, on a site that calls
     the entities as above: `sg_takes` on Slate, Camera, Lens and Camera Setup; `sg_camera_setups`
     on Camera and Lens; `sg_slates` on Shoot Day and Lighting Setup; and on Attachment (File)
     `custom_entityNN_sg_photos_custom_entityNNs`, with the Take's slot number. A link that would
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

## In Flow PT

- Shoot Day, Slate, Camera rows in the test project, each with **Onset UUID** filled.
- A Take row: Name is the take number, **Slate** links the slate, **Start Time** and **End Time**
  to the second, **Date Created** equal to the start time, **Circled** as set.
- **Photos** on the take holds one Attachment named `onset_<photo>_<file>.jpg`, display name
  `Photo <time>`. Open it: full resolution, the same size as on the iPad.
- No duplicate rows after step 9.

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
- A photo: in Flow PT, open the file's link in a new tab. It shows as an image, not a download
  of `binary/octet-stream`. Two photos on one take: **Photos** holds both.

## What to send back

The status at each step, any **Needs attention** with its words, and anything in Flow PT that
does not match the list above.
