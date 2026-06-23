import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Bind to the Bastion Host's Admin Network IP (192.168.10.x).
    // This is the dedicated management subnet — the Master Node (192.168.10.2)
    // is on the same switch, so SSH automation commands have the shortest path.
    // Do NOT bind to the provisioning (20.x) or data (30.x) networks —
    // those carry PXE/NFS/MPI traffic, not admin UI traffic.
    //
    // NOTE: In production, Nginx on the Master Node (192.168.10.2) will serve
    // the built React bundle and proxy /api/* to FastAPI. This dev config is
    // only for the laptop-as-bastion-host development workflow.
    host: true,
    port: 5173,
    strictPort: true,   // Fail hard if port is taken — no silent port drift
  },
})
