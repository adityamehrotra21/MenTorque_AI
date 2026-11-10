import { useParams } from "react-router-dom";
import { InterviewReport } from "../components/InterviewReport";

export default function ReportPage() {
  const { id = "" } = useParams();
  return <InterviewReport key={id} interviewId={id} />;
}
