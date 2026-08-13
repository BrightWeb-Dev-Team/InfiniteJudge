import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const apiPort = process.env.API_PORT || process.env.PORT || '3001';
export default defineConfig({plugins:[react()],server:{proxy:{'/api':`http://localhost:${apiPort}`}}});
