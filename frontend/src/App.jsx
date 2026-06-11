import { useEffect } from "react";

import "./App.css";

import Navbar from "./components/navbar";
import DeliverablesPage from "./pages/deliverablesPage";
import ProjectsPage from "./pages/projectsPage";
import PeoplePage from "./pages/peoplePage";
import { initializeSchema } from "./services/schemaService";

import { Routes, Route } from "react-router-dom";

function App() {
  useEffect(() => {
    async function bootstrapSchema() {
      try {
        await initializeSchema();
      } catch (error) {
        console.error(
          "Failed to initialize database schema:",
          error
        );
      }
    }

    bootstrapSchema();
  }, []);

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/deliverables" element={<DeliverablesPage />} />
      </Routes>
    </>
  );
}


export default App;
