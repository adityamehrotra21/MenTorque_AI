import { useParams } from "react-router-dom";
import { InterviewRoom } from "../components/InterviewRoom";

export default function InterviewPage() {
  const { id = "" } = useParams();
  return <InterviewRoom key={id} interviewId={id} />;
}
