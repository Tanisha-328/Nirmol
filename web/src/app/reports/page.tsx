import type { Metadata } from "next";
import { PollutionReporting } from "@/components/PollutionReporting";
export const metadata:Metadata={title:"Report pollution | Nirmol",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function ReportingPage(){return <PollutionReporting/>;}
