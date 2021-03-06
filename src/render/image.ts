import {createPolygonMatrix, EdgeMatrix, PolygonMatrix} from "../matrix";
import {exec} from "child_process";
import {promises as fs} from "fs";
import {calculateSurfaceNormal, clamp, toRadians, Vector, vectorize} from "../utility/math-utility";
import {calculateColor, Color, eyeVector, viewingVector} from "./lighting";
import {
    addRay,
    dotProduct, multiplyRay,
    randomUnitRay,
    Ray,
    rayAtTime,
    rayLengthSquared,
    scaleRay,
    subtractRay,
    unitRay
} from "./ray";
import chalk from "chalk";
import {HitRecords, Hittable, Sphere} from "./hittable";
import HittableList from "./hittableList";
import Camera from "./camera";
import {Dielectric, LambertianDiffuse, Metal, ScatterInfo} from "../material";

export abstract class Image {
    public readonly columns: number;
    public readonly rows: number;
    protected matrix: string[][];
    protected static tempIndex = 0;

    /**
     * Creates a new image.
     * @param columns Amount of rows
     * @param rows Amount of columns
     * @param shading Type of rendering
     */
    protected constructor(columns: number, rows: number){
        this.columns = columns;
        this.rows = rows;
        this.matrix = new Array(rows);
        for(let row = 0; row < rows; row++){
            this.matrix[row] = new Array(columns);
        }
    }

    public abstract drawPolygons(polygons: PolygonMatrix, colorName?: string): void;

    /**
     * Clears all the points plotted on the image.
     */
    public abstract clear(): void;

    /**
     * Saves the file in the current directory with the given filename and file type. File type determined from
     * characters following the first "." character found in fileName.
     * @param fileName
     */
    public async saveToDisk(fileName: string){
        // create a temporary .ppm file so we can convert it to the file type requested
        const ppmFile = fileName.substring(0, fileName.indexOf(".")) + ".ppm";
        await fs.writeFile(ppmFile, this.toString());

        if(!fileName.endsWith(".ppm")){
            // convert to type requested (type is given by fileName)
            // and delete the temporary .ppm file after
            await new Promise((resolve, reject) => {
                exec(`convert ${ppmFile} ${fileName} && rm ${ppmFile}`, () => {
                    resolve();
                });
            })
        }
    }

    /**
     * Shows the image on the screen for the user to see
     */
    public display(){
        // save file first
        const fileName = `temp${Image.tempIndex++}.ppm`;
        this.saveToDisk(fileName).then(() => {
            exec(`display ${fileName}`);
            exec(`display ${fileName}`);
        });
    }

    /**
     * Fills in the pixel at the given row and column index with the given color
     * @param col Row index
     * @param row Column index
     * @param z Z value of object that will be drawn
     * @param color String representation of a color P3
     */
    protected abstract plot(col: number, row: number, z: number, color: string): void;

    /**
     * Converts this image to a string
     * @returns String representation of the image that follows PPM P3 specifications
     */
    toString(): string{
        let string = `P3\n${this.columns} ${this.rows}\n255\n`;
        for(let row = 0; row < this.rows; row++){
            for(let column = 0; column < this.columns; column++){
                const color = this.matrix[row][column];
                if(color === undefined || color === ""){
                    // No color, default to white
                    string += "255 255 255\n";
                }else{
                    string += color + "\n";
                }
            }
        }
        return string;
    }

    /* 2D stuff deprecated */
    /**
     * Draw a line given two points: (Point0 and Point1).
     * @param col0 First point row index
     * @param row0 First point column index
     * @param col1 Second point row index
     * @param row1 Second point column index
     * @param color Color of the string
     * @private
     */
    private line(col0: number, row0: number, z0: number, col1: number, row1: number, z1: number, color: string){
        // Reorder the given points such that Point0 is to the left of Point1 (or same column index)
        // We want to render left to right
        if(col0 > col1){
            this.line(col1, row1, z1, col0, row0, z0, color);
            return;
        }

        if(row1 > row0){
            // Octant 1 or 2

            // These delta values will always be positive or 0
            let deltaRow = row1 - row0; // Think of change in cartesian Y
            let deltaCol = col1 - col0; // Think of change in cartesian X

            // Find if in octant 1 or 2
            if(deltaRow < deltaCol){
                // 1 > slope > 0: Octant 1
                let distance = deltaRow - 2 * deltaCol;
                const numPixels = col1 - col0 + 1;  // add one since we are measuring amount not distance
                const deltaZ = (z1 - z0) / numPixels;

                while(col0 <= col1){
                    this.plot(col0, row0, z0, color);
                    if(distance > 0){
                        row0 += 1;
                        distance += 2 * (-deltaCol);
                    }
                    col0 += 1;
                    z0 += deltaZ;
                    distance += 2 * deltaRow;
                }
            }else{
                // Slope > 1: Octant 2
                let distance = deltaRow - 2 * deltaCol;
                const numPixels = row1 - row0 + 1;  // add one since we are measuring amount not distance
                const deltaZ = (z1 - z0) / numPixels;
                while(row0 <= row1){
                    this.plot(col0, row0, z0, color);
                    if(distance < 0){
                        col0 += 1;
                        distance += 2 * deltaRow;
                    }
                    row0 += 1;
                    z0 += deltaZ;
                    distance += 2 * -deltaCol;
                }
            }
        }else{
            // Octant 7 or 8

            let deltaRow = row1 - row0; // Think of change in cartesian Y. Always negative
            let deltaCol = col1 - col0; // Think of change in cartesian X. Always positive

            if(Math.abs(deltaRow) < Math.abs(deltaCol)){
                // Octant 8
                let distance = 2 * deltaRow + deltaCol;
                const numPixels = col1 - col0 + 1;  // add one since we are measuring amount not distance
                const deltaZ = (z1 - z0) / numPixels;
                while(col0 <= col1){
                    this.plot(col0, row0, z0, color);
                    if(distance < 0){
                        row0 -= 1;
                        distance += 2 * deltaCol;
                    }
                    col0 += 1;
                    z0 += deltaZ;
                    distance += 2 * deltaRow;
                }
            }else{
                // Octant 7
                let distance = deltaRow + 2 * deltaCol;
                const numPixels = row1 - row0 + 1;  // add one since we are measuring amount not distance
                const deltaZ = (z1 - z0) / numPixels;
                while(row0 >= row1){
                    this.plot(col0, row0, z0, color);
                    if(distance > 0){
                        col0 += 1;
                        distance += 2 * deltaRow;
                    }
                    row0 -= 1;
                    z0 += deltaZ;
                    distance += 2 * deltaCol;
                }
            }
        }
    }

    /**
     * Draw lines
     * @param edgeMatrix Matrix with edge coordinates
     */
    public drawEdges(edgeMatrix: EdgeMatrix){
        for(let pointIndex = 0; pointIndex < edgeMatrix.length; pointIndex += 2){
            this.line(edgeMatrix[pointIndex][0], edgeMatrix[pointIndex][1], edgeMatrix[pointIndex][2],
                edgeMatrix[pointIndex + 1][0], edgeMatrix[pointIndex + 1][1], edgeMatrix[pointIndex + 1][2], "0 0 0");
        }
    }
}

export class RayTraceImage extends Image {
    /**
     * [x, y, z, normal]
     */
    private polygons: [number, number, number, number][];
    private hittableList: HittableList;
    private fov: number = toRadians(25);
    private samplesPerPixel = 200;
    private maxRecursionDepth = 50;

    constructor(columns: number, rows: number) {
        super(columns, rows);
        this.polygons = createPolygonMatrix();
        this.hittableList = new HittableList();
    }

    public clear() {
        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                this.matrix[row][column] = "";
            }
        }
    }

    protected plot(col: number, row: number, z: number, color: string): void {
        // no need to check bounds since our ray tracer sends ray to each pixel, unlike Phong, which calulates color
        // for each polygon (triangle)
        row = this.rows - 1 - row;
        this.matrix[row][col] = color;
    }

    public drawPolygons(polygons: PolygonMatrix, colorName?: string): void {
        // nothing
    }

    public addWorldShape(hittable: Hittable){
        this.hittableList.add(hittable);
    }

    public async saveToDisk(fileName: string) {
        // drawing polygons doesn't actually draw on to the picture, we must ray trace to generate the images
        this.rayTracePolygons();
        super.saveToDisk(fileName);
        console.log(chalk.green("Please open " + fileName))
    }

    private rayTracePolygons() {
        let pixel = 0;

        const camera = new Camera();

        for (let row = this.rows - 1; row >= 0; row--) {
            for (let column = 0; column < this.columns; column++) {
                const pixelColor = [0, 0, 0];

                // sampling color
                for(let sample = 0; sample < this.samplesPerPixel; sample++){
                    const u = (column + Math.random()) / (this.columns - 1);
                    const v = (row + Math.random()) / (this.rows - 1);

                    let primaryRayDirection = camera.getRay(u, v);

                    const color = this.getRayColor([0, 0, 0], primaryRayDirection, 1);
                    for(let i = 0; i < 3; i++){
                        pixelColor[i] += color[i];
                    }

                }

                const colorString = pixelColor.map(val => Math.floor(clamp(Math.sqrt(val / this.samplesPerPixel), 0, .999) * 255)).join(" ");
                this.plot(column, row, 1, colorString);

                pixel++;
            }
            console.log(chalk.green(`Finished pixel ${pixel} of ${500 * 500} (${(pixel) / (500 * 500)})`));
        }
    }

    private getRayColor(origin: Ray, directionRay: Ray, depth: number): number[]{
        if(depth > this.maxRecursionDepth){
            return [0, 0, 0];
        }

        const hitRecords: HitRecords = {
            faceNormal: undefined,
            isFrontFace: false,
            normal: undefined,
            material: undefined,
            positionOfIntersection: undefined, // p
            time: 0
        };
        if(this.hittableList.hit(origin, directionRay, 0, Infinity, hitRecords)){
            const scatterInfo: ScatterInfo = {
                scatteredPosition: undefined,
                scatteredDirection: undefined,
                attenuation: undefined
            };
            if(hitRecords.material.scatter(origin, directionRay, hitRecords, scatterInfo)){
                return multiplyRay(scatterInfo.attenuation, this.getRayColor(scatterInfo.scatteredPosition, scatterInfo.scatteredDirection, depth + 1) as Ray);
            }
            return [0, 0, 0];
        }else{
            const unit = unitRay(directionRay);
            const t = 0.5 * (unit[1] + 1);
            return addRay(scaleRay([1, 1, 1], (1 - t)), scaleRay([0.5, 0.7, 1], t));
        }
    }
}

export class PhongImage extends Image{
    /**
     * Keep track of the z coordinate of objected drawn at each pixel
     */
    protected zBuffer: number[][];

    constructor(columns: number, rows: number){
        super(columns, rows);
        this.zBuffer = new Array(rows);
        for(let row = 0; row < rows; row++){
            this.zBuffer[row] = new Array(columns).fill(-Infinity);
        }
    }

    public drawPolygons(polygons: PolygonMatrix, colorName?: string){
        for(let point = 0; point < polygons.length - 2; point+=3){
            const p0 = polygons[point];
            const p1 = polygons[point + 1];
            const p2 = polygons[point + 2];

            // Find surface normal if we were to render the triangle
            const vector0: Vector = vectorize(p1, p0);
            const vector1: Vector = vectorize(p2, p0);
            const surfaceNormal: Vector = calculateSurfaceNormal(vector0, vector1);

            // For the triangle to be drawn, the angle between the surfaceNormal and viewVector needs to be
            // between -90 degrees and 90 degrees
            if(dotProduct(surfaceNormal, viewingVector) > 0) {
                const color = calculateColor(surfaceNormal, colorName);

                // organize the points of the triangle by their y values
                let [bottom, middle, top] = [p0, p1, p2];
                if(bottom[1] > top[1]){
                    [bottom, top] = [top, bottom];
                }
                if(bottom[1] > middle[1]){
                    [bottom, middle] = [middle, bottom];
                }
                if(middle[1] > top[1]){
                    [middle, top] = [top, middle];
                }

                let y = bottom[1];
                let x0 = bottom[0];
                let x1 = bottom[0];
                let z0 = bottom[2];
                let z1 = bottom[2];

                // change in x
                const startXDelta = (top[0] - bottom[0]) / (top[1] - bottom[1] + 1);
                let endXDelta = (middle[0] - bottom[0]) / (middle[1] - bottom[1] + 1);
                const endXDeltaFlip = (top[0] - middle[0]) / (top[1] - middle[1] + 1);

                let startZDelta = (top[2] - bottom[2]) / (top[1] - bottom[1] + 1);
                let endZDelta = (middle[2] - bottom[2]) / (middle[1] - bottom[1] + 1);
                let endZDeltaFlip = (top[2] - middle[2]) / (top[1] - middle[1] + 1);

                while(y <= top[1]){
                    this.drawHorizontal(y, Math.floor(x0), Math.floor(x1), z0, z1, color.toString());
                    x0 += startXDelta;
                    x1 += endXDelta;
                    z0 += startZDelta;
                    z1 += endZDelta;
                    // We passed a vertex, so we need to change what deltaX and deltaZ we are using
                    if(y === middle[1]){
                        endXDelta = endXDeltaFlip;
                        endZDelta = endZDeltaFlip;
                        x1 = middle[0];
                        z1 = middle[2];
                    }
                    y++;
                }
            }
        }
    }

    /**
     * To be used with drawPolygon() for Scanline algorithm. Draws a horizontal line between (x0, y) and (x1, y).
     * @param y
     * @param x0
     * @param x1
     * @param color
     */
    private drawHorizontal(y: number, x0: number, x1: number, zStart: number, zEnd: number, color: string){
        if(x0 > x1){
            this.drawHorizontal(y, x1, x0, zEnd, zStart, color);
            return;
        }

        const pixelInLine = x1 - x0 + 1; // add one since we might be drawing a 1 pixel long horizontal
        let deltaZ = (zEnd - zStart) / pixelInLine;
        while(x0 <= x1){
            this.plot(x0, y, zStart, color);
            zStart += deltaZ;
            x0++;
        }
    }

    public clear(){
        for(let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                this.matrix[row][column] = "";
                this.zBuffer[row][column] = -Infinity;
            }
        }
    }

    protected plot(col: number, row: number, z: number, color: string){
        row = this.rows - 1 - row;
        if(col >= 0 && col < this.columns && row >= 0 && row < this.rows && z >= this.zBuffer[row][col]){
            // row should be counting from the bottom of the screen
            this.matrix[row][col] = color;
            this.zBuffer[row][col] = z;
        }
    }
}