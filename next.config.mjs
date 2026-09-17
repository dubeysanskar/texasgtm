/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deploys build into a temporary folder (scripts/deploy.sh) so the live app never loses its build mid-deploy
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
