"use strict";
class ModelTransform{
    /**
    * Creates an instance of ModelTransform.
    * @param {Object} mesh the mesh data of this model, eg. vertices, positions, etc.
    * @param {Object} material material data for this model, eg. color and textures.
    * @param {Vector3} position the center of the model in world space.
    * @param {Vector3} rotation the rotation of the model (in degrees: x,y,z -> pitch,yaw,roll).
    * @param {Vector3} scale width, height and depth of the model (base is 1/1/1).
    */
    constructor(mesh, material, position, rotation, scale){

        this.mesh = mesh;
        this.material = material;

        // set properties of transform (clone vectors to avoid accidental referencing)
        // if position, rotation and scale are not provided in the constructor
        // (are undefined), we simply set them to default values.
        if(position){ this.position = position.clone();}
        else {        this.position = new V3();}

        if(rotation){ this.rotation = rotation;}
        else {        this.rotation = new V3();}

        if(scale){ this.scale = scale.clone();}
        else {     this.scale = new V3(1,1,1);}

        // create and initialize Matrix
        this.modelMatrix = new M4();
        this.updateMatrix();
	}

    //...................................................
	//Methods
    //...................................................
	update(){
		this.updateMatrix();
		return this;
	}

    updateMatrix(){
        this.modelMatrix.reset(); // we reset the matrix first and then calculate the new matrix from position, rotation and scale.

        this.modelMatrix = M4.translationMatrix(this.position.x,this.position.y,this.position.z);
        this.modelMatrix = M4.multM4(this.modelMatrix, M4.rotationMatrixY(this.rotation.y));
        this.modelMatrix = M4.multM4(this.modelMatrix, M4.rotationMatrixX(this.rotation.x));
        this.modelMatrix = M4.multM4(this.modelMatrix, M4.rotationMatrixZ(this.rotation.z));
        this.modelMatrix = M4.multM4(this.modelMatrix, M4.scaleMatrix(this.scale.x,this.scale.y,this.scale.z));
    }

    // The base Vectors i,j and k of our 4x4 model matrix can be extracted to give us
    // the local right, upwards and forward direction of the model (its local X, Y and Z axis in the world).
    // This is useful to perform for example movement operations on the transform.
    get localRight(){ return new V3(this.modelMatrix[0],this.modelMatrix[1],this.modelMatrix[2]);}
    get localUp(){    return new V3(this.modelMatrix[4],this.modelMatrix[5],this.modelMatrix[6]);}
    get localForward(){    return new V3(this.modelMatrix[8],this.modelMatrix[9],this.modelMatrix[10]);}

    reset(){
        this.position.set(0,0,0);
        this.scale.set(1,1,1);
        this.rotation.set(0,0,0);
        this.modelMatrix.reset();
        return this;
    }

    render(shader, camera, lightingData){

        gl.useProgram(shader.program);

        this.setUniformData(shader, camera, lightingData);

        this.setVertexArrays(shader);

        // if the mesh has an index buffer, use index(element) based drawing.
        if(this.mesh.indexCount){
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.bufIndex);
            gl.drawElements(this.mesh.drawMode, this.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
        }
        // otherwise use regular drawing.
        else {
            gl.drawArrays(this.mesh.drawMode, 0, this.mesh.vertexCount);
        }

        return this;
	}

    setVertexArrays(shader){
        // position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.positionBuffer);
        gl.enableVertexAttribArray(shader.attribLoc.position);
        gl.vertexAttribPointer(shader.attribLoc.position,3,gl.FLOAT,false,0,0);

        // normal buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.normalBuffer);
        gl.enableVertexAttribArray(shader.attribLoc.normal);
        gl.vertexAttribPointer(shader.attribLoc.normal,3,gl.FLOAT,false,0,0);

        // texcoord buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.texcoordBuffer);
        gl.enableVertexAttribArray(shader.attribLoc.texcoord);
        gl.vertexAttribPointer(shader.attribLoc.texcoord,2,gl.FLOAT,false,0,0);
    }

    setUniformData(shader, camera, lightingData){

        let viewMatrix = camera.viewMatrix;
        let projectionMatrix = camera.projectionMatrix;
        let cameraPosition = camera.getPosition();

        // set model, view and projection matrices in the vertex shader
        gl.uniformMatrix4fv(shader.uniformLoc.modelMatrix, false, this.transform.modelMatrix.toFloat32());
        gl.uniformMatrix4fv(shader.uniformLoc.viewMatrix, false, viewMatrix.toFloat32());
        gl.uniformMatrix4fv(shader.uniformLoc.projectionMatrix, false, projectionMatrix.toFloat32());

        // set tint color, if a corresponding uniform exists in the shader.
        if(shader.uniformLoc.tint)
            gl.uniform4fv(shader.uniformLoc.tint, new Float32Array(this.material.tint));

        // set model inverse transpose to enable lighting calulations using normals
        if(shader.uniformLoc.modelInverseTransposeMatrix)
            gl.uniformMatrix3fv(shader.uniformLoc.modelInverseTransposeMatrix, false,
                Matrix4x4.inverseTranspose3x3(this.transform.modelMatrix).toFloat32());

        // lighting
        if(shader.uniformLoc.viewPos)
            gl.uniform3fv(shader.uniformLoc.viewPos, cameraPosition.toFloat32());
        // if the shader supports directional lighting
        if(shader.uniformLoc.directionalLight)
            gl.uniform3fv(shader.uniformLoc.directionalLight, lightingData.directionalLight.toFloat32());
        if(shader.uniformLoc.directionalColor)
            gl.uniform3fv(shader.uniformLoc.directionalColor, lightingData.directionalColor.toFloat32());
        // if the shader supports point lighting
        if(shader.uniformLoc.pointLight)
            gl.uniform3fv(shader.uniformLoc.pointLight, lightingData.pointLight.toFloat32());
        if(shader.uniformLoc.pointLightColor)
            gl.uniform3fv(shader.uniformLoc.pointLightColor, lightingData.pointLightColor.toFloat32());
        // if the shader supports ambient lighting
        if(shader.uniformLoc.ambientColor)
            gl.uniform3fv(shader.uniformLoc.ambientColor, lightingData.ambientColor.toFloat32());
        // if the shader supports specular highlights
        if(shader.uniformLoc.shininess)
            gl.uniform1f(shader.uniformLoc.shininess, this.material.shininess);

        // texturing
        if(shader.uniformLoc.mainTexture){
            // activate texture unit 0
            gl.activeTexture(gl.TEXTURE0);
            // bind texture
            gl.bindTexture(gl.TEXTURE_2D, TextureCache[this.material.mainTexture]);
            // set main texture data to texture unit 0
            gl.uniform1i(shader.uniformLoc.mainTexture, 0); //Our predefined uniformLoc.mainTexture is uMainTex
        }
    }
}
