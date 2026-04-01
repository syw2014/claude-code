import { describe, expect, test } from "bun:test";
import { deriveAdvisorAvailability } from "../advisor.js";

describe("deriveAdvisorAvailability", () => {
	test("hides advisor when first-party betas are unavailable", () => {
		expect(
			deriveAdvisorAvailability({
				disabledByEnv: false,
				supportsFirstPartyBetas: false,
				remotelyEnabled: true,
				locallyConfigured: true,
			}),
		).toEqual({
			enabled: false,
			canUserConfigure: false,
		});
	});

	test("shows advisor configuration on supported providers before it is enabled", () => {
		expect(
			deriveAdvisorAvailability({
				disabledByEnv: false,
				supportsFirstPartyBetas: true,
				remotelyEnabled: false,
				locallyConfigured: false,
			}),
		).toEqual({
			enabled: false,
			canUserConfigure: true,
		});
	});

	test("enables advisor after local configuration on a supported provider", () => {
		expect(
			deriveAdvisorAvailability({
				disabledByEnv: false,
				supportsFirstPartyBetas: true,
				remotelyEnabled: false,
				locallyConfigured: true,
			}),
		).toEqual({
			enabled: true,
			canUserConfigure: true,
		});
	});

	test("lets remote rollout keep advisor enabled on supported providers", () => {
		expect(
			deriveAdvisorAvailability({
				disabledByEnv: false,
				supportsFirstPartyBetas: true,
				remotelyEnabled: true,
				locallyConfigured: false,
			}),
		).toEqual({
			enabled: true,
			canUserConfigure: true,
		});
	});

	test("respects the explicit advisor disable env var", () => {
		expect(
			deriveAdvisorAvailability({
				disabledByEnv: true,
				supportsFirstPartyBetas: true,
				remotelyEnabled: true,
				locallyConfigured: true,
			}),
		).toEqual({
			enabled: false,
			canUserConfigure: false,
		});
	});
});
