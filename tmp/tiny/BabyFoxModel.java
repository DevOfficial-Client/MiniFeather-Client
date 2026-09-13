package com.evandev.tiny_takeover_backport.client.model;

import net.minecraft.client.model.FoxModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.*;
import net.minecraft.world.entity.animal.Fox;
import org.jetbrains.annotations.NotNull;

public class BabyFoxModel<T extends Fox> extends FoxModel<T> {

    private final ModelPart body;
    private final ModelPart rightHindLeg;
    private final ModelPart leftHindLeg;
    private final ModelPart rightFrontLeg;
    private final ModelPart leftFrontLeg;
    private final ModelPart tail;

    public BabyFoxModel(ModelPart root) {
        super(root);
        this.body = root.getChild("body");
        this.rightHindLeg = root.getChild("right_hind_leg");
        this.leftHindLeg = root.getChild("left_hind_leg");
        this.rightFrontLeg = root.getChild("right_front_leg");
        this.leftFrontLeg = root.getChild("left_front_leg");
        this.tail = this.body.getChild("tail");
    }

    public static LayerDefinition createBodyLayer() {
        MeshDefinition meshdefinition = new MeshDefinition();
        PartDefinition root = meshdefinition.getRoot();
        root.addOrReplaceChild(
                "head",
                CubeListBuilder.create()
                        .texOffs(0, 0)
                        .addBox(-3.0F, -2.125F, -5.125F, 6.0F, 5.0F, 5.0F, new CubeDeformation(0.0F))
                        .texOffs(18, 20)
                        .addBox(-1.0F, 0.875F, -7.125F, 2.0F, 2.0F, 2.0F, new CubeDeformation(0.0F))
                        .texOffs(22, 8)
                        .addBox(-3.0F, -4.125F, -4.125F, 2.0F, 2.0F, 1.0F, new CubeDeformation(0.0F))
                        .texOffs(22, 11)
                        .addBox(1.0F, -4.125F, -4.125F, 2.0F, 2.0F, 1.0F, new CubeDeformation(0.0F)),
                PartPose.offset(0.0F, 18.125F, 0.125F)
        );
        root.addOrReplaceChild(
                "right_hind_leg",
                CubeListBuilder.create().texOffs(22, 4).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offset(-1.5F, 22.0F, 4.0F)
        );
        root.addOrReplaceChild(
                "left_hind_leg",
                CubeListBuilder.create().texOffs(22, 0).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offset(1.5F, 22.0F, 4.0F)
        );
        root.addOrReplaceChild(
                "right_front_leg",
                CubeListBuilder.create().texOffs(22, 4).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offset(-1.5F, 22.0F, 0.0F)
        );
        root.addOrReplaceChild(
                "left_front_leg",
                CubeListBuilder.create().texOffs(22, 0).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 2.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offset(1.5F, 22.0F, 0.0F)
        );
        PartDefinition body = root.addOrReplaceChild(
                "body",
                CubeListBuilder.create().texOffs(0, 10).addBox(-2.5F, -2.0F, -3.0F, 5.0F, 4.0F, 6.0F, new CubeDeformation(0.0F)),
                PartPose.offset(0.0F, 20.0F, 2.0F)
        );
        body.addOrReplaceChild(
                "tail",
                CubeListBuilder.create().texOffs(0, 20).addBox(-1.5F, -1.48F, -1.0F, 3.0F, 3.0F, 6.0F, new CubeDeformation(0.0F)),
                PartPose.offset(0.0F, -0.5F, 3.0F)
        );
        return LayerDefinition.create(meshdefinition, 32, 32);
    }

    @Override
    public void prepareMobModel(@NotNull T entity, float limbSwing, float limbSwingAmount, float partialTick) {
        super.prepareMobModel(entity, limbSwing, limbSwingAmount, partialTick);

        this.body.setPos(0.0F, 20.0F, 2.0F);
        this.body.xRot = 0.0F;
        this.body.zRot = 0.0F;
        this.head.setPos(0.0F, 18.125F, 0.125F);
        this.head.yRot = 0.0F;

        this.rightHindLeg.setPos(-1.5F, 22.0F, 4.0F);
        this.leftHindLeg.setPos(1.5F, 22.0F, 4.0F);
        this.rightFrontLeg.setPos(-1.5F, 22.0F, 0.0F);
        this.leftFrontLeg.setPos(1.5F, 22.0F, 0.0F);
        this.rightHindLeg.visible = true;
        this.leftHindLeg.visible = true;
        this.rightFrontLeg.visible = true;
        this.leftFrontLeg.visible = true;
        this.tail.setPos(0.0F, -0.5F, 3.0F);
        this.tail.xRot = -0.05235988F;

        if (entity.isCrouching()) {
            this.body.y += entity.getCrouchAmount(partialTick) / 6.0F;
            this.head.y += entity.getCrouchAmount(partialTick) / 6.0F;
            this.body.xRot = 0.10471976F;
        } else if (entity.isSleeping()) {
            this.body.zRot = (float) (-Math.PI / 2);
            this.body.xRot = (float) (-Math.PI / 18);
            this.body.y += 1.0F;
            this.body.z -= 1.0F;
            this.body.x -= 1.0F;
            this.tail.xRot = -2.1816616F;
            this.tail.x -= 0.7F;
            this.tail.z += 0.6F;
            this.tail.y += 0.9F;
            this.head.x -= 2.0F;
            this.head.y += 2.8F;
            this.head.z -= 4.0F;
            this.head.yRot = (float) (-Math.PI * 2.0 / 3.0);
            this.head.zRot = 0.0F;
            this.rightHindLeg.visible = false;
            this.leftHindLeg.visible = false;
            this.rightFrontLeg.visible = false;
            this.leftFrontLeg.visible = false;
        } else if (entity.isSitting()) {
            this.body.xRot = -0.959931F;
            this.body.z -= 2.25F;
            this.body.y += 1.5F;
            this.tail.y -= 0.6F;
            this.tail.z -= 1.0F;
            this.tail.xRot = 0.95993114F;
            this.head.y -= 0.75F;
            this.head.xRot = 0.0F;
            this.rightFrontLeg.xRot = (float) (-Math.PI / 12);
            this.leftFrontLeg.xRot = (float) (-Math.PI / 12);
            this.rightFrontLeg.z -= 1.0F;
            this.leftFrontLeg.z -= 1.0F;
            this.rightFrontLeg.x += 0.01F;
            this.leftFrontLeg.x -= 0.01F;
            this.rightHindLeg.z -= 3.75F;
            this.leftHindLeg.z -= 3.75F;
            this.rightHindLeg.x += 0.01F;
            this.leftHindLeg.x -= 0.01F;
        }
    }
}