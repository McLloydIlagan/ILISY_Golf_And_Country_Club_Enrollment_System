# ILISY Golf & Country Club API Setup

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (comes with Node.js)

## Setup Instructions

1. Clone the repository:
   ```sh
   git clone <repo-url>
   ```
2. Navigate to the API folder:
   ```sh
   cd src/Data/API
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Copy the example environment file and set your own values:
   ```sh
   cp .env.example .env
   # Edit .env and fill in your MongoDB URI and JWT secret
   ```
5. Start the server:
   ```sh
   npm start
   ```

## Notes

- Ensure your MongoDB database is accessible to all developers.
- All dependencies are locked in package-lock.json for consistency.
- If you add new dependencies, commit the updated package-lock.json.
