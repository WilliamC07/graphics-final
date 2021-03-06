import {Point, Edge} from "../matrix";
import {addRay, crossProduct, Ray, scaleRay, subtractRay} from "../render/ray";

export function toRadians (angle: number): number {
    return angle * (Math.PI / 180);
}

export type Vector = Ray;  // [x, y, z]
/**
 * Gives a vector from p0 to p1 (P0 --> P1)
 * @param p0
 * @param p1
 */
export function vectorize(p0: Point|Edge, p1: Point|Edge): Vector{
    return [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
}

export function calculateSurfaceNormal(p0: Vector, p1: Vector): Vector {
    return crossProduct(p0, p1);
}

export function normalizeVector(vector: Vector): Vector {
    const magnitude = Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2) + Math.pow(vector[2], 2));
    return [
        vector[0] / magnitude,
        vector[1] / magnitude,
        vector[2] / magnitude
    ];
}

export function randomNumber(min: number, max: number){
    return min + (max - min) * Math.random();
}

/**
 * Limits the value to the given range (open interval)
 * @param value
 * @param min
 * @param max
 */
export function clamp(value: number, min: number, max: number){
    if(value > max) return max;
    if(value < min) return min;
    return value;
}

export function schlick(cosine: number, reflectionIndex: number){
    // approximation for reflectivity w/ angle
    let r0 = (1 - reflectionIndex) / (1+reflectionIndex);
    r0 *= r0;
    return r0 + (1 - r0) * Math.pow(1 - cosine, .5)
}