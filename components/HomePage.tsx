import React from "react";
import { Highlight } from "./highlight";

const HomePage = () => {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 w-full">
        <p>
          Puja hopping <br /> without <Highlight>the guesswork </Highlight>
        </p>
      </div>
    </div>
  );
};

export default HomePage;
