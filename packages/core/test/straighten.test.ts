import { describe, expect, it } from "vitest";
import {
  clampStraighten,
  commands,
  createDocument,
  effectiveCrop,
  imageToStage,
  inscribedSize,
  invert,
  MAX_STRAIGHTEN,
  nearestQuarterTurns,
  rectIsAllImage,
  stageRect,
  straightenAngleOf,
} from "@pixen/core";

const DEGREE = Math.PI / 180;

function document(width = 1600, height = 1000) {
  return createDocument({ resourceId: "res_1", width, height });
}

/** Whether the document's crop still lands entirely on the image. */
function cropIsAllImage(doc: ReturnType<typeof document>): boolean {
  const imageFromStage = invert(imageToStage(doc.source, doc.transform));
  return rectIsAllImage(effectiveCrop(doc), imageFromStage, doc.source);
}

describe("angle arithmetic", () => {
  it("splits a rotation into quarter turns and a remainder", () => {
    expect(nearestQuarterTurns(Math.PI / 2 + 5 * DEGREE)).toBe(1);
    expect(straightenAngleOf(Math.PI / 2 + 5 * DEGREE)).toBeCloseTo(5 * DEGREE);
  });

  it("never reports more than a 45° straighten, whatever the rotation", () => {
    for (let degrees = -400; degrees <= 400; degrees += 7) {
      expect(Math.abs(straightenAngleOf(degrees * DEGREE))).toBeLessThanOrEqual(MAX_STRAIGHTEN + 1e-9);
    }
  });

  it("clamps an absurd angle rather than passing it on", () => {
    expect(clampStraighten(Math.PI)).toBeCloseTo(MAX_STRAIGHTEN);
    expect(clampStraighten(Number.NaN)).toBe(0);
  });
});

describe("inscribedSize", () => {
  it("is the whole image when nothing is rotated", () => {
    const size = inscribedSize({ width: 1600, height: 1000 }, 0, 1.6);
    expect(size.width).toBeCloseTo(1600);
    expect(size.height).toBeCloseTo(1000);
  });

  it("shrinks as the angle grows", () => {
    const image = { width: 1600, height: 1000 };
    const small = inscribedSize(image, 5 * DEGREE, 1.6);
    const large = inscribedSize(image, 20 * DEGREE, 1.6);
    expect(large.width).toBeLessThan(small.width);
    expect(small.width).toBeLessThan(image.width);
  });

  it("keeps the aspect ratio it was asked for", () => {
    const size = inscribedSize({ width: 1600, height: 1000 }, 12 * DEGREE, 1);
    expect(size.width / size.height).toBeCloseTo(1);
  });

  it("is symmetric: the sign of the angle does not matter", () => {
    const image = { width: 1600, height: 1000 };
    expect(inscribedSize(image, 9 * DEGREE, 1.6).width).toBeCloseTo(
      inscribedSize(image, -9 * DEGREE, 1.6).width,
    );
  });
});

describe("straighten", () => {
  it("leaves no blank corners at any angle it accepts", () => {
    // The whole point of the command: a straightened export is all image.
    for (let degrees = -45; degrees <= 45; degrees += 3) {
      const straightened = commands.straighten(document(), degrees * DEGREE);
      expect(cropIsAllImage(straightened)).toBe(true);
    }
  });

  it("is absolute, so setting the same angle twice changes nothing", () => {
    const once = commands.straighten(document(), 7 * DEGREE);
    const twice = commands.straighten(once, 7 * DEGREE);
    expect(twice.transform.rotation).toBeCloseTo(once.transform.rotation);
    // Idempotent to within float noise, which is all a second identical set
    // should cost.
    expect(twice.crop!.x).toBeCloseTo(once.crop!.x);
    expect(twice.crop!.y).toBeCloseTo(once.crop!.y);
    expect(twice.crop!.width).toBeCloseTo(once.crop!.width);
    expect(twice.crop!.height).toBeCloseTo(once.crop!.height);
  });

  it("keeps the quarter turns the document already had", () => {
    const turned = commands.rotateQuarterTurns(document(), 1);
    const straightened = commands.straighten(turned, 6 * DEGREE);
    expect(nearestQuarterTurns(straightened.transform.rotation)).toBe(1);
    expect(straightenAngleOf(straightened.transform.rotation)).toBeCloseTo(6 * DEGREE);
    expect(cropIsAllImage(straightened)).toBe(true);
  });

  it("returns the full frame when straightened back to zero", () => {
    const doc = document();
    const straightened = commands.straighten(commands.straighten(doc, 15 * DEGREE), 0);
    const crop = effectiveCrop(straightened);
    expect(crop.width).toBeCloseTo(stageRect(straightened).width, 0);
  });

  it("keeps an off-centre crop where it is when the angle still covers it", () => {
    const doc = commands.setCrop(document(), { x: 100, y: 100, width: 400, height: 250 });
    const straightened = commands.straighten(doc, 2 * DEGREE);
    const crop = effectiveCrop(straightened);
    // A small angle leaves plenty of room, so the crop should not have jumped
    // back to the middle of the image.
    expect(crop.x + crop.width / 2).toBeLessThan(stageRect(straightened).width / 2);
    expect(cropIsAllImage(straightened)).toBe(true);
  });

  it("falls back to the centre when an off-centre crop can no longer fit", () => {
    const doc = commands.setCrop(document(), { x: 0, y: 0, width: 1500, height: 900 });
    const straightened = commands.straighten(doc, 30 * DEGREE);
    const stage = stageRect(straightened);
    const crop = effectiveCrop(straightened);
    expect(crop.x + crop.width / 2).toBeCloseTo(stage.x + stage.width / 2, 0);
    expect(cropIsAllImage(straightened)).toBe(true);
  });

  it("holds the locked aspect ratio while straightening", () => {
    const locked = commands.setAspectRatio(document(), 1);
    const straightened = commands.straighten(locked, 11 * DEGREE);
    const crop = effectiveCrop(straightened);
    expect(crop.width / crop.height).toBeCloseTo(1);
    expect(cropIsAllImage(straightened)).toBe(true);
  });
});
