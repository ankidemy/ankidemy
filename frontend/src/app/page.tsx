import Layout from "./layout";
import Navbar from "./components/Navbar";
import HomePage from "@/app/components/HomePage";

export default function Home() {
  return (
    <Layout>
      <Navbar />
      <HomePage />
    </Layout>
  );
}