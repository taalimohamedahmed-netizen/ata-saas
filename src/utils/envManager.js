const fs = require('fs');
const path = require('path');
const os = require('os');

const envPath = path.resolve(__dirname, '../../.env');

function updateEnv(updates) {
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  let newEnvContent = envContent;

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(newEnvContent)) {
      newEnvContent = newEnvContent.replace(regex, `${key}=${value}`);
    } else {
      newEnvContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, newEnvContent.trim() + os.EOL, 'utf8');
}

function isSystemConfigured() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_URL'];
  for (const key of required) {
    if (!process.env[key] || process.env[key].includes('placeholder') || process.env[key].includes('example.com')) {
      return false;
    }
  }
  return true;
}

module.exports = { updateEnv, isSystemConfigured };
