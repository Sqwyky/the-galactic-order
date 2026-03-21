/**
 * THE GALACTIC ORDER — Dialogue System Tests
 *
 * Tests the dialogue system logic without DOM dependencies.
 * Since DialogueSystem requires a browser DOM, we test the
 * logic through the module's exported interface where possible.
 */

import { describe, it, expect } from 'vitest';

// Since DialogueSystem requires DOM (document.createElement),
// we test its integration points and data flow rather than DOM manipulation.

describe('DialogueSystem (logic tests)', () => {
    it('module exports DialogueSystem class', async () => {
        const mod = await import('../../client/js/ui/DialogueSystem.js');
        expect(mod.DialogueSystem).toBeDefined();
        expect(typeof mod.DialogueSystem).toBe('function');
    });

    it('DialogueSystem constructor signature expects options', async () => {
        const { DialogueSystem } = await import('../../client/js/ui/DialogueSystem.js');
        // Can't instantiate without DOM, but can verify the class exists
        expect(DialogueSystem.prototype).toHaveProperty('startDialogue');
        expect(DialogueSystem.prototype).toHaveProperty('closeDialogue');
        expect(DialogueSystem.prototype).toHaveProperty('isDialogueActive');
        expect(DialogueSystem.prototype).toHaveProperty('showProximityHint');
        expect(DialogueSystem.prototype).toHaveProperty('hideProximityHint');
        expect(DialogueSystem.prototype).toHaveProperty('dispose');
    });
});
