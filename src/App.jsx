import { useState } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import UploadBox from "./components/UploadBox";
import Footer from "./components/Footer";
import ResultCard from "./components/ResultCard";
function App() {
  const [result, setResult] = useState(null);;
  return (
    <div className="app-container">
      <Navbar />
      <Hero />
      <UploadBox setResult={setResult} />
      {
        result &&
        <ResultCard result={result} />
      }



    </div>
  );
}

export default App;