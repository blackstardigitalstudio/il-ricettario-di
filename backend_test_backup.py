"""Backend tests for Backup Export/Import feature and regression.

Targets: {EXPO_PUBLIC_BACKEND_URL}/api
"""
import os
import sys
import uuid
import json
import requests
from pathlib import Path

# Load backend URL from frontend .env
BACKEND_URL = None
env_path = Path("/app/frontend/.env")
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BACKEND_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not BACKEND_URL:
    BACKEND_URL = "http://localhost:8001"

API = BACKEND_URL.rstrip("/") + "/api"
print(f"Testing against: {API}")

# Device ids for user isolation (16-128 chars)
DEVICE_A = "device-a-" + uuid.uuid4().hex  # 40+ chars
DEVICE_B = "device-b-" + uuid.uuid4().hex

HA = {"X-Device-Id": DEVICE_A, "Content-Type": "application/json"}
HB = {"X-Device-Id": DEVICE_B, "Content-Type": "application/json"}

PASSED = 0
FAILED = 0
FAILURES = []


def check(cond, name, detail=""):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  \u2713 {name}")
    else:
        FAILED += 1
        FAILURES.append(f"{name} :: {detail}")
        print(f"  \u2717 {name} :: {detail}")


def section(name):
    print(f"\n==== {name} ====")


# ---------- Clean up any prior backup-related data for these devices ----------
# (Devices are fresh UUIDs so should already be empty — but we can assert)
section("0) Fresh device — sanity empty")
r = requests.get(f"{API}/folders", headers=HA)
check(r.status_code == 200 and r.json() == [], "Device A starts with 0 folders", f"{r.status_code} {r.text[:200]}")
r = requests.get(f"{API}/recipes", headers=HA)
check(r.status_code == 200 and r.json() == [], "Device A starts with 0 recipes", f"{r.status_code} {r.text[:200]}")

# ---------- 1. Seed data for device A: 2 folders, 1 subfolder, 2 recipes ----
section("1) Seed data for Device A")
f1 = requests.post(f"{API}/folders", headers=HA, json={"name": "Dolci"})
check(f1.status_code == 200, "POST /folders Dolci", f"{f1.status_code} {f1.text[:200]}")
fid1 = f1.json().get("id")

f2 = requests.post(f"{API}/folders", headers=HA, json={"name": "Primi Piatti"})
check(f2.status_code == 200, "POST /folders Primi Piatti", f"{f2.status_code} {f2.text[:200]}")
fid2 = f2.json().get("id")

s1 = requests.post(f"{API}/subfolders", headers=HA, json={"folder_id": fid1, "name": "Torte"})
check(s1.status_code == 200, "POST /subfolders Torte in Dolci", f"{s1.status_code} {s1.text[:200]}")
sid1 = s1.json().get("id")

# Recipes: use a supported URL pattern (Instagram reel). The extract will fail but recipe is still created.
reel_url1 = "https://www.instagram.com/reel/CxYZabc12aA/"
reel_url2 = "https://www.instagram.com/reel/CxYZabc12bB/"
r1 = requests.post(f"{API}/recipes", headers=HA, json={
    "source_url": reel_url1,
    "name": "Tiramisù della Nonna",
    "folder_id": fid1,
    "subfolder_id": sid1,
    "manual_caption": "Ricetta classica del tiramisù",
    "notes": "Test backup",
})
check(r1.status_code == 200, "POST /recipes 1", f"{r1.status_code} {r1.text[:200]}")
rid1 = r1.json().get("id")

r2 = requests.post(f"{API}/recipes", headers=HA, json={
    "source_url": reel_url2,
    "name": "Pasta al Pomodoro",
    "folder_id": fid2,
    "manual_caption": "Classica pasta italiana",
})
check(r2.status_code == 200, "POST /recipes 2", f"{r2.status_code} {r2.text[:200]}")
rid2 = r2.json().get("id")

# Update recipe 1 with tags/ingredients for richer payload
upd = requests.put(f"{API}/recipes/{rid1}", headers=HA, json={
    "tags": ["italiano", "dolce-casa"],
    "difficulty": "medio",
    "prep_time": 20,
    "cook_time": 0,
    "is_favorite": True,
    "ingredients": "- 4 uova\n- 250g mascarpone\n- 100g zucchero",
})
check(upd.status_code == 200, "PUT /recipes update extended fields", f"{upd.status_code} {upd.text[:200]}")

# ---------- 2. Export backup ----------
section("2) GET /backup/export")
e = requests.get(f"{API}/backup/export", headers=HA)
check(e.status_code == 200, "export returns 200", f"{e.status_code} {e.text[:200]}")
payload = e.json() if e.status_code == 200 else {}

for k in ("version", "exported_at", "app", "folders", "subfolders", "recipes", "totals"):
    check(k in payload, f"export payload has key '{k}'", f"keys={list(payload.keys())}")

check(payload.get("app") == "Il Ricettario", "app tag == 'Il Ricettario'", f"got {payload.get('app')}")
check(payload.get("version") == 1, "version == 1", f"got {payload.get('version')}")

totals = payload.get("totals") or {}
check(totals.get("folders") == 2, "totals.folders == 2", f"got {totals.get('folders')}")
check(totals.get("subfolders") == 1, "totals.subfolders == 1", f"got {totals.get('subfolders')}")
check(totals.get("recipes") == 2, "totals.recipes == 2", f"got {totals.get('recipes')}")

check(len(payload.get("folders", [])) == 2, "folders array len 2")
check(len(payload.get("subfolders", [])) == 1, "subfolders array len 1")
check(len(payload.get("recipes", [])) == 2, "recipes array len 2")

# Verify no Mongo _id
for col in ("folders", "subfolders", "recipes"):
    for doc in payload.get(col, []):
        if "_id" in doc:
            check(False, f"no _id in {col}", f"doc has _id: {doc}")
            break
    else:
        check(True, f"no _id in {col}")

# ---------- 3. Import MERGE with same payload -> all skipped ----------
section("3) POST /backup/import mode=merge (duplicates)")
im = requests.post(f"{API}/backup/import", headers=HA, json={"data": payload, "mode": "merge"})
check(im.status_code == 200, "import merge returns 200", f"{im.status_code} {im.text[:200]}")
body = im.json() if im.status_code == 200 else {}
check(body.get("success") is True, "success=true", body)
check(body.get("mode") == "merge", "mode echoed 'merge'", body)
imp = body.get("imported") or {}
check(imp.get("folders") == 0, "imported.folders == 0", imp)
check(imp.get("subfolders") == 0, "imported.subfolders == 0", imp)
check(imp.get("recipes") == 0, "imported.recipes == 0", imp)
check(imp.get("skipped", 0) > 0, "imported.skipped > 0", imp)
check(imp.get("skipped") == 2 + 1 + 2, "imported.skipped == 5 (2f+1sf+2r)", imp)

# Confirm nothing duplicated
fcnt = len(requests.get(f"{API}/folders", headers=HA).json())
scnt = len(requests.get(f"{API}/subfolders", headers=HA).json())
rcnt_json = requests.get(f"{API}/recipes/count", headers=HA).json()
check(fcnt == 2 and scnt == 1 and rcnt_json.get("count") == 2,
      "no duplicates after merge (2/1/2)", f"{fcnt}/{scnt}/{rcnt_json}")

# ---------- 4. Import REPLACE ----------
section("4) POST /backup/import mode=replace")
im2 = requests.post(f"{API}/backup/import", headers=HA, json={"data": payload, "mode": "replace"})
check(im2.status_code == 200, "import replace returns 200", f"{im2.status_code} {im2.text[:200]}")
body2 = im2.json() if im2.status_code == 200 else {}
check(body2.get("mode") == "replace", "mode echoed 'replace'", body2)
imp2 = body2.get("imported") or {}
check(imp2.get("folders") == 2, "imported.folders == 2", imp2)
check(imp2.get("subfolders") == 1, "imported.subfolders == 1", imp2)
check(imp2.get("recipes") == 2, "imported.recipes == 2", imp2)
check(imp2.get("skipped") == 0, "imported.skipped == 0", imp2)

# Verify data persists after replace
fols_after = requests.get(f"{API}/folders", headers=HA).json()
check(len(fols_after) == 2, "GET /folders has 2 after replace", fols_after)
fol_names = sorted([f["name"] for f in fols_after])
check(fol_names == ["Dolci", "Primi Piatti"], "folder names correct", fol_names)

recs_after = requests.get(f"{API}/recipes", headers=HA).json()
check(len(recs_after) == 2, "GET /recipes has 2 after replace", recs_after)
rec_names = sorted([r["name"] for r in recs_after])
check(rec_names == ["Pasta al Pomodoro", "Tiramisù della Nonna"], "recipe names correct", rec_names)

# Tiramisù should retain its tags/ingredients
tira = next((r for r in recs_after if r["name"] == "Tiramisù della Nonna"), None)
check(tira is not None, "tiramisù restored")
if tira:
    check(tira.get("tags") == ["italiano", "dolce-casa"], "tags preserved", tira.get("tags"))
    check(tira.get("is_favorite") is True, "is_favorite preserved", tira.get("is_favorite"))
    check("mascarpone" in (tira.get("ingredients") or ""), "ingredients preserved",
          tira.get("ingredients"))
    check(tira.get("local_video_path") in ("", None), "local_video_path reset after import",
          tira.get("local_video_path"))

# ---------- 5. Import with data not a dict -> 400 ----------
section("5) Import data='not-a-dict' -> 400")
bad1 = requests.post(f"{API}/backup/import", headers=HA, json={"data": "not-a-dict", "mode": "merge"})
# FastAPI/Pydantic may raise 422 because model requires dict for `data`; accept either 400 or 422
check(bad1.status_code in (400, 422), "returns 400/422 for non-dict data", f"{bad1.status_code} {bad1.text[:200]}")

# ---------- 6. Import with wrong app tag -> 400 ----------
section("6) Import wrong app tag -> 400")
bad2 = requests.post(f"{API}/backup/import", headers=HA, json={
    "data": {"app": "Foo", "folders": [], "subfolders": [], "recipes": []},
    "mode": "merge",
})
check(bad2.status_code == 400, "returns 400 wrong app tag", f"{bad2.status_code} {bad2.text[:200]}")

# ---------- 7. Import invalid mode -> 400 ----------
section("7) Import mode='invalid' -> 400")
bad3 = requests.post(f"{API}/backup/import", headers=HA, json={
    "data": {"folders": [], "subfolders": [], "recipes": []},
    "mode": "invalid",
})
check(bad3.status_code == 400, "returns 400 invalid mode", f"{bad3.status_code} {bad3.text[:200]}")

# ---------- 8. User isolation: device B export should be empty ----------
section("8) User isolation — device B export is empty")
eB = requests.get(f"{API}/backup/export", headers=HB)
check(eB.status_code == 200, "export for B returns 200", f"{eB.status_code} {eB.text[:200]}")
payB = eB.json() if eB.status_code == 200 else {}
check(payB.get("totals", {}).get("folders") == 0, "B totals.folders==0", payB.get("totals"))
check(payB.get("totals", {}).get("subfolders") == 0, "B totals.subfolders==0", payB.get("totals"))
check(payB.get("totals", {}).get("recipes") == 0, "B totals.recipes==0", payB.get("totals"))
check(payB.get("folders") == [] and payB.get("subfolders") == [] and payB.get("recipes") == [],
      "B arrays are all empty")

# ============== REGRESSION =================
section("R) Regression — core endpoints")

# GET /api/
rr = requests.get(f"{API}/")
check(rr.status_code == 200, "GET /api/ 200", rr.status_code)
check(rr.json().get("message") == "Il Ricettario - API", "root message", rr.json())

# /auth/me fallback
rr = requests.get(f"{API}/auth/me", headers=HA)
check(rr.status_code == 200, "/auth/me 200", rr.status_code)
j = rr.json()
check(j.get("user_id") == f"device_{DEVICE_A}", "/auth/me returns device user for device A",
      j.get("user_id"))

# /auth/me without any header -> DEFAULT_LOCAL_USER
rr2 = requests.get(f"{API}/auth/me")
check(rr2.status_code == 200 and rr2.json().get("user_id") == "local_user",
      "/auth/me fallback to local_user without X-Device-Id", rr2.json())

# Recipes search — ingredients/tags
rr = requests.get(f"{API}/recipes", headers=HA, params={"search": "mascarpone"})
check(rr.status_code == 200 and any(r["id"] == tira["id"] for r in rr.json() if r.get("id")),
      "search=mascarpone matches ingredients", rr.status_code)

rr = requests.get(f"{API}/recipes", headers=HA, params={"search": "italiano"})
check(rr.status_code == 200 and any(r.get("name") == "Tiramisù della Nonna" for r in rr.json()),
      "search=italiano matches via tags", rr.status_code)

rr = requests.get(f"{API}/recipes", headers=HA, params={"search": "Pasta"})
check(rr.status_code == 200 and any(r.get("name") == "Pasta al Pomodoro" for r in rr.json()),
      "search=Pasta matches by name", rr.status_code)

rr = requests.get(f"{API}/recipes", headers=HA, params={"search": "no_such_thing_xyz_123"})
check(rr.status_code == 200 and rr.json() == [], "search unknown term -> empty", rr.status_code)

# favorites filter
rr = requests.get(f"{API}/recipes", headers=HA, params={"favorites": "true"})
check(rr.status_code == 200 and len(rr.json()) == 1 and rr.json()[0].get("name") == "Tiramisù della Nonna",
      "favorites filter returns only tiramisù", rr.status_code)

# Find the new rid for Pasta (id changed if it was regenerated during merge/replace? id is preserved)
pasta = next((r for r in recs_after if r.get("name") == "Pasta al Pomodoro"), None)
if pasta:
    # Shopping list needs ingredients; pasta has none → should 400
    slresp = requests.post(f"{API}/shopping-list/generate", headers=HA,
                           json={"recipe_ids": [pasta["id"]], "language": "it"})
    check(slresp.status_code == 400, "shopping-list 400 when no ingredients",
          f"{slresp.status_code} {slresp.text[:200]}")

# Empty recipe_ids -> 400
slresp = requests.post(f"{API}/shopping-list/generate", headers=HA,
                       json={"recipe_ids": [], "language": "it"})
check(slresp.status_code == 400, "shopping-list 400 empty recipe_ids",
      f"{slresp.status_code} {slresp.text[:200]}")

# Unknown id -> 404
slresp = requests.post(f"{API}/shopping-list/generate", headers=HA,
                       json={"recipe_ids": ["no-such-id-xxx"], "language": "it"})
check(slresp.status_code == 404, "shopping-list 404 unknown id",
      f"{slresp.status_code} {slresp.text[:200]}")

# Shopping list: real aggregation with tiramisù (has ingredients)
if tira:
    slresp = requests.post(f"{API}/shopping-list/generate", headers=HA,
                           json={"recipe_ids": [tira["id"]], "language": "it"})
    ok = slresp.status_code == 200
    check(ok, "shopping-list 200 with ingredients",
          f"{slresp.status_code} {slresp.text[:200]}")
    if ok:
        jbody = slresp.json()
        check("id" in jbody and "items" in jbody and "raw" in jbody and "recipe_names" in jbody,
              "shopping-list response keys present", list(jbody.keys()))
        check(isinstance(jbody.get("items"), list) and len(jbody["items"]) > 0,
              "shopping-list items populated", jbody.get("items"))
        check(jbody.get("recipe_names") == ["Tiramisù della Nonna"],
              "recipe_names match", jbody.get("recipe_names"))

# ------ Folders/Subfolders/Recipes CRUD regression ------
section("R) Folder/Subfolder/Recipe CRUD quick check")
# Get folder by id
gf = requests.get(f"{API}/folders/{fid1}", headers=HA)
check(gf.status_code == 200 and gf.json().get("name") == "Dolci", "GET /folders/{id} ok", gf.status_code)

# Update folder
uf = requests.put(f"{API}/folders/{fid1}", headers=HA, json={"name": "Dolci Italiani"})
check(uf.status_code == 200 and uf.json().get("name") == "Dolci Italiani",
      "PUT /folders/{id} ok", uf.status_code)

# Subfolders filter by folder_id
gs = requests.get(f"{API}/subfolders", headers=HA, params={"folder_id": fid1})
check(gs.status_code == 200 and len(gs.json()) == 1 and gs.json()[0].get("name") == "Torte",
      "GET /subfolders?folder_id filter ok", gs.status_code)

# Update subfolder
us = requests.put(f"{API}/subfolders/{sid1}", headers=HA, json={"name": "Torte Fredde"})
check(us.status_code == 200 and us.json().get("name") == "Torte Fredde",
      "PUT /subfolders/{id} ok", us.status_code)

# Unknown folder id -> 404
g404 = requests.get(f"{API}/folders/no-such-id", headers=HA)
check(g404.status_code == 404, "GET /folders/{unknown} 404", g404.status_code)

# POST /recipes with unsupported URL -> 400
bad_url = requests.post(f"{API}/recipes", headers=HA,
                        json={"source_url": "https://example.com/foo"})
check(bad_url.status_code == 400, "POST /recipes unsupported URL 400", bad_url.status_code)

# ---------- cleanup ----------
section("Z) Cleanup device A")
for fid in (fid1, fid2):
    requests.delete(f"{API}/folders/{fid}", headers=HA)

final_fols = requests.get(f"{API}/folders", headers=HA).json()
final_recs = requests.get(f"{API}/recipes", headers=HA).json()
check(final_fols == [] and final_recs == [],
      "after cascade delete A is empty", f"folders={final_fols}, recipes={final_recs}")

# Summary
print(f"\n==== RESULT: {PASSED} passed, {FAILED} failed ====")
if FAILURES:
    print("\nFailures:")
    for f in FAILURES:
        print(f" - {f}")
sys.exit(0 if FAILED == 0 else 1)
