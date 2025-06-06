import * as chai from "chai";
import sinon from "sinon";
import sinonChai from "sinon-chai";

const { expect } = chai;

// Configure chai
chai.use(sinonChai);

// Export test utilities
export { chai, expect, sinon }; 