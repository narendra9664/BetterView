import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("dashboard", "routes/dashboard.tsx"),
    route("visualizer/:id", "routes/visualizer.$id.tsx"),
    route("pricing", "routes/pricing.tsx"),
    route("meta.json", "routes/meta.json.ts"),
] satisfies RouteConfig;
