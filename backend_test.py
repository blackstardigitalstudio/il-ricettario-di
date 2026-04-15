#!/usr/bin/env python3
"""
Backend API Testing for Recipe Manager
Tests all CRUD operations for folders, subfolders, and recipes
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from frontend .env
BACKEND_URL = "https://food-organizer-24.preview.emergentagent.com/api"

class RecipeManagerTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_data = {}
        self.results = []
        
    def log_result(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
    
    def test_welcome_endpoint(self):
        """Test GET /api/ - Should return welcome message"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "Recipe Manager" in data["message"]:
                    self.log_result("Welcome Endpoint", True, f"Status: {response.status_code}, Message: {data['message']}")
                    return True
                else:
                    self.log_result("Welcome Endpoint", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Welcome Endpoint", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Welcome Endpoint", False, f"Exception: {str(e)}")
            return False
    
    def test_create_folder(self):
        """Test POST /api/folders - Create a new folder with name 'Dolci'"""
        try:
            payload = {"name": "Dolci"}
            response = self.session.post(f"{self.base_url}/folders", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "name" in data and data["name"] == "Dolci":
                    self.test_data["folder_id"] = data["id"]
                    self.log_result("Create Folder", True, f"Created folder 'Dolci' with ID: {data['id']}")
                    return True
                else:
                    self.log_result("Create Folder", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Create Folder", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Create Folder", False, f"Exception: {str(e)}")
            return False
    
    def test_get_folders(self):
        """Test GET /api/folders - Should return list of folders"""
        try:
            response = self.session.get(f"{self.base_url}/folders")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    # Check if our created folder is in the list
                    folder_found = any(folder.get("name") == "Dolci" for folder in data)
                    if folder_found:
                        self.log_result("Get Folders", True, f"Retrieved {len(data)} folders, including 'Dolci'")
                        return True
                    else:
                        self.log_result("Get Folders", False, f"'Dolci' folder not found in list of {len(data)} folders")
                        return False
                else:
                    self.log_result("Get Folders", False, f"Expected list, got: {type(data)}")
                    return False
            else:
                self.log_result("Get Folders", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Get Folders", False, f"Exception: {str(e)}")
            return False
    
    def test_create_subfolder(self):
        """Test POST /api/subfolders - Create subfolder in the folder created"""
        if "folder_id" not in self.test_data:
            self.log_result("Create Subfolder", False, "No folder_id available from previous test")
            return False
        
        try:
            payload = {
                "folder_id": self.test_data["folder_id"],
                "name": "Tiramisù Recipes"
            }
            response = self.session.post(f"{self.base_url}/subfolders", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "name" in data and data["folder_id"] == self.test_data["folder_id"]:
                    self.test_data["subfolder_id"] = data["id"]
                    self.log_result("Create Subfolder", True, f"Created subfolder '{data['name']}' with ID: {data['id']}")
                    return True
                else:
                    self.log_result("Create Subfolder", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Create Subfolder", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Create Subfolder", False, f"Exception: {str(e)}")
            return False
    
    def test_get_subfolders(self):
        """Test GET /api/subfolders?folder_id={folder_id} - Get subfolders for a folder"""
        if "folder_id" not in self.test_data:
            self.log_result("Get Subfolders", False, "No folder_id available from previous test")
            return False
        
        try:
            params = {"folder_id": self.test_data["folder_id"]}
            response = self.session.get(f"{self.base_url}/subfolders", params=params)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    # Check if our created subfolder is in the list
                    subfolder_found = any(
                        subfolder.get("folder_id") == self.test_data["folder_id"] 
                        for subfolder in data
                    )
                    if subfolder_found:
                        self.log_result("Get Subfolders", True, f"Retrieved {len(data)} subfolders for folder")
                        return True
                    else:
                        self.log_result("Get Subfolders", False, f"No subfolders found for folder_id: {self.test_data['folder_id']}")
                        return False
                else:
                    self.log_result("Get Subfolders", False, f"Expected list, got: {type(data)}")
                    return False
            else:
                self.log_result("Get Subfolders", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Get Subfolders", False, f"Exception: {str(e)}")
            return False
    
    def test_extract_video(self):
        """Test POST /api/extract - Test video extraction with URL"""
        try:
            payload = {"url": "https://www.instagram.com/reel/test123/"}
            response = self.session.post(f"{self.base_url}/extract", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if "success" in data:
                    # Note: This will likely fail for a test URL, but we're testing the endpoint structure
                    if data["success"]:
                        self.log_result("Extract Video", True, f"Video extraction successful: {data.get('platform', 'unknown')}")
                        return True
                    else:
                        # Expected failure for test URL, but endpoint is working
                        self.log_result("Extract Video", True, f"Endpoint working, expected failure for test URL: {data.get('error', 'No error message')}")
                        return True
                else:
                    self.log_result("Extract Video", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Extract Video", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Extract Video", False, f"Exception: {str(e)}")
            return False
    
    def test_create_recipe(self):
        """Test POST /api/recipes - Create a recipe"""
        if "folder_id" not in self.test_data:
            self.log_result("Create Recipe", False, "No folder_id available from previous test")
            return False
        
        try:
            payload = {
                "name": "Tiramisù",
                "source_url": "https://www.instagram.com/reel/test123/",
                "folder_id": self.test_data["folder_id"],
                "manual_caption": "Ricetta del tiramisù tradizionale"
            }
            response = self.session.post(f"{self.base_url}/recipes", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "name" in data and data["name"] == "Tiramisù":
                    self.test_data["recipe_id"] = data["id"]
                    self.log_result("Create Recipe", True, f"Created recipe 'Tiramisù' with ID: {data['id']}")
                    return True
                else:
                    self.log_result("Create Recipe", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Create Recipe", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Create Recipe", False, f"Exception: {str(e)}")
            return False
    
    def test_get_recipes(self):
        """Test GET /api/recipes - Should return list of recipes"""
        try:
            response = self.session.get(f"{self.base_url}/recipes")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    # Check if our created recipe is in the list
                    recipe_found = any(recipe.get("name") == "Tiramisù" for recipe in data)
                    if recipe_found:
                        self.log_result("Get Recipes", True, f"Retrieved {len(data)} recipes, including 'Tiramisù'")
                        return True
                    else:
                        self.log_result("Get Recipes", False, f"'Tiramisù' recipe not found in list of {len(data)} recipes")
                        return False
                else:
                    self.log_result("Get Recipes", False, f"Expected list, got: {type(data)}")
                    return False
            else:
                self.log_result("Get Recipes", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Get Recipes", False, f"Exception: {str(e)}")
            return False
    
    def test_update_recipe(self):
        """Test PUT /api/recipes/{recipe_id} - Update the recipe name"""
        if "recipe_id" not in self.test_data:
            self.log_result("Update Recipe", False, "No recipe_id available from previous test")
            return False
        
        try:
            payload = {"name": "Tiramisù Classico"}
            response = self.session.put(f"{self.base_url}/recipes/{self.test_data['recipe_id']}", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if "name" in data and data["name"] == "Tiramisù Classico":
                    self.log_result("Update Recipe", True, f"Updated recipe name to: {data['name']}")
                    return True
                else:
                    self.log_result("Update Recipe", False, f"Name not updated correctly: {data}")
                    return False
            else:
                self.log_result("Update Recipe", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Update Recipe", False, f"Exception: {str(e)}")
            return False
    
    def test_delete_recipe(self):
        """Test DELETE /api/recipes/{recipe_id} - Delete the recipe"""
        if "recipe_id" not in self.test_data:
            self.log_result("Delete Recipe", False, "No recipe_id available from previous test")
            return False
        
        try:
            response = self.session.delete(f"{self.base_url}/recipes/{self.test_data['recipe_id']}")
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_result("Delete Recipe", True, f"Recipe deleted: {data['message']}")
                    return True
                else:
                    self.log_result("Delete Recipe", False, f"Unexpected response format: {data}")
                    return False
            else:
                self.log_result("Delete Recipe", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Delete Recipe", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting Recipe Manager API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        tests = [
            self.test_welcome_endpoint,
            self.test_create_folder,
            self.test_get_folders,
            self.test_create_subfolder,
            self.test_get_subfolders,
            self.test_extract_video,
            self.test_create_recipe,
            self.test_get_recipes,
            self.test_update_recipe,
            self.test_delete_recipe
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            print()  # Empty line for readability
        
        print("=" * 60)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check details above.")
            return False
    
    def get_summary(self):
        """Get a summary of test results"""
        passed = sum(1 for result in self.results if result["success"])
        total = len(self.results)
        
        summary = {
            "total_tests": total,
            "passed": passed,
            "failed": total - passed,
            "success_rate": f"{(passed/total)*100:.1f}%" if total > 0 else "0%",
            "results": self.results
        }
        
        return summary

def main():
    """Main function to run tests"""
    tester = RecipeManagerTester()
    success = tester.run_all_tests()
    
    # Print detailed summary
    summary = tester.get_summary()
    print(f"\n📋 Detailed Summary:")
    print(f"   Total Tests: {summary['total_tests']}")
    print(f"   Passed: {summary['passed']}")
    print(f"   Failed: {summary['failed']}")
    print(f"   Success Rate: {summary['success_rate']}")
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()