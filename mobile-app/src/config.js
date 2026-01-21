// API Configuration
// Replace with your computer's IP address when testing on physical device
// Use 'localhost' only for iOS simulator or Android emulator with adb reverse

// Get your IP: run `ipconfig getifaddr en0` on Mac or `ipconfig` on Windows
const DEV_IP = '192.168.29.134'

// For Android Emulator, use 10.0.2.2
// For iOS Simulator, use localhost
// For physical device, use your computer's IP address
export const API_URL = `http://${DEV_IP}:5001/api`

// Uncomment below for Android Emulator
// export const API_URL = 'http://10.0.2.2:5001/api'

// For production, use your deployed backend URL
// export const API_URL = 'https://your-production-api.com/api'
