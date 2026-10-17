import { handleReporting, type ReportingRoute } from "./reports-backend";
import { reportingDependencies } from "./reports-runtime";

export function reportHandler(request:Request, route:ReportingRoute, id:string|null=null) {
  return handleReporting(request,route,id,reportingDependencies());
}
