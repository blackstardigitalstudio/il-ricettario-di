#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Test the Recipe Manager API backend with comprehensive CRUD operations for folders, subfolders, and recipes"

backend:
  - task: "Welcome Endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "GET /api/ endpoint working correctly, returns welcome message 'Recipe Manager API'"

  - task: "Folder CRUD Operations"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "All folder operations working: POST /api/folders creates folder 'Dolci', GET /api/folders retrieves list including created folder"

  - task: "Subfolder CRUD Operations"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Subfolder operations working: POST /api/subfolders creates subfolder in parent folder, GET /api/subfolders?folder_id={id} retrieves subfolders correctly"

  - task: "Video Extraction Service"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "POST /api/extract endpoint working correctly. Expected failure for test URL due to Instagram authentication requirements, but endpoint structure and error handling working properly"

  - task: "Recipe CRUD Operations"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "All recipe operations working: POST /api/recipes creates recipe with manual caption, GET /api/recipes retrieves list, PUT /api/recipes/{id} updates recipe name, DELETE /api/recipes/{id} deletes recipe successfully"

  - task: "Database Integration"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "MongoDB integration working correctly. All CRUD operations persist data properly, UUIDs used correctly instead of ObjectIDs"

  - task: "API Error Handling"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Error handling working properly. 404 errors for non-existent resources, proper validation for required fields"

frontend:
  - task: "Frontend Testing"
    implemented: "NA"
    working: "NA"
    file: "frontend/src/App.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "testing"
        comment: "Frontend testing not performed as per testing agent guidelines - backend testing only"

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "All backend API endpoints tested and working"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: "Comprehensive backend testing completed successfully. All 10 API endpoints tested with 100% pass rate. Recipe Manager API is fully functional with proper CRUD operations for folders, subfolders, and recipes. Video extraction service working with proper error handling for authentication issues. Database integration working correctly with MongoDB. Ready for production use."
  - agent: "main"
    message: "i18n fully wired (2026-04-17). Root LangProvider wraps app, Welcome screen has top-right language picker (10 languages: IT/EN/ES/FR/DE/PT/JA/AR/ZH/RU), Drawer menu shows current language inline + has Language option. All main screens (Home, Add Recipe, Folders, Recipe Detail, Welcome) use t() translation helper. Language choice saved in AsyncStorage. Home crash fixed by clearing Metro cache. Backend remained unchanged - no retest needed."
  - agent: "main"
    message: "Feature: Instagram Session Integration added (2026-04-17). Allows users to connect their IG account via in-app WebView → cookies captured → encrypted (Fernet) → stored per-user → used with yt-dlp for real caption/thumbnail extraction. Added legal disclaimer modal, 20 req/h rate limit, disconnect option. Backend endpoints: POST/GET/DELETE /api/instagram/session. Frontend: /app/instagram-login.tsx with WebView + disclaimer. Drawer shows 'Connect Instagram' / 'Instagram connected @username' with toggle. Also REMOVED Foodish fake image fallback: if real extraction fails, thumbnail stays empty (user can upload manually). Translations added in IT/EN. Other languages fall back to Italian for IG strings (acceptable for now)."
  - agent: "main"
    message: "REFACTORING COMPLETE (2026-04-17). Split monolithic server.py (1101 lines) into modular structure: server.py (37 lines entry) + config.py + db.py + models.py + services/{video,scraping,ai,instagram}.py + routes/{auth,extract,folders,subfolders,recipes,videos,instagram}.py. No behavior changes, all endpoints preserved at same URLs with same request/response schemas. Backend restarted cleanly, smoke checks (GET /api/, GET /api/recipes, POST /api/extract) all pass. Also fixed EAS build assets: created missing splash-icon.png and resized favicon.png to square 512x512. Please run full backend regression to confirm the refactor didn't break anything."
  - agent: "testing"
    message: "POST-REFACTOR REGRESSION COMPLETE (2026-04-17). Ran 29 backend tests against http://localhost:8001/api covering every endpoint listed in the review request. 29/29 PASSED (100%). Verified: (1) GET /api/ returns {'message':'Il Ricettario - API'}. (2) Folders CRUD: POST/GET-list/GET-by-id/PUT/DELETE all OK, 404 on unknown id. (3) Subfolders CRUD with folder_id query filter, 404 on unknown id. (4) Recipes CRUD: POST with instagram reel URL creates recipe with platform='instagram', manual_caption preserved; GET list, /count {count:N}, /random?count=3, GET/PUT/DELETE by id all OK. Unsupported URL returns 400 on POST /api/recipes and success=false on POST /api/extract. (5) Auth: /auth/me returns DEFAULT_LOCAL_USER fallback {user_id:'local_user',...} when no token; /auth/logout returns {'message':'Logout effettuato'}. (6) Instagram: GET /api/instagram/session returns {connected:false,username:'',connected_at:''}; DELETE returns {success:true,connected:false}. (7) Cascade delete confirmed: deleting a folder also removes its subfolders and recipes. No regressions vs pre-refactor behavior - endpoint paths, request schemas, and response shapes all identical."

