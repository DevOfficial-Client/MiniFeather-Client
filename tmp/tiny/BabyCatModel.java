package com.evandev.tiny_takeover_backport.client.model;

import net.minecraft.client.model.CatModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.*;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.animal.Cat;
import org.jetbrains.annotations.NotNull;

public class BabyCatModel<T extends Cat> extends CatModel<T> {

    public BabyCatModel(ModelPart root) {
        super(root);
    }

    public static LayerDefinition createBodyLayer() {
        return createBodyLayer(CubeDeformation.NONE);
    }

    public static LayerDefinition createCollarLayer() {
        return createBodyLayer(new CubeDeformation(0.01F));
    }

    public static LayerDefinition createBodyLayer(CubeDeformation g) {
        MeshDefinition meshdefinition = new MeshDefinition();
        PartDefinition partdefinition = meshdefinition.getRoot();
        partdefinition.addOrReplaceChild(
                "head",
                CubeListBuilder.create()
                        .texOffs(0, 0)
                        .addBox(-2.5F, -3.0F, -2.875F, 5.0F, 4.0F, 4.0F, g)
                        .texOffs(18, 0)
                        .addBox(-2.0F, -4.0F, -0.875F, 1.0F, 1.0F, 2.0F, g)
                        .texOffs(24, 0)
                        .addBox(1.0F, -4.0F, -0.875F, 1.0F, 1.0F, 2.0F, g)
                        .texOffs(18, 3)
                        .addBox(-1.5F, -1.0F, -3.875F, 3.0F, 2.0F, 1.0F, g),
                PartPose.offset(0.0F, 20.0F, -3.125F)
        );
        partdefinition.addOrReplaceChild(
                "left_front_leg", CubeListBuilder.create().texOffs(18, 18).addBox(-0.5F, 0.0F, -1.0F, 1.0F, 2.0F, 2.0F, g), PartPose.offset(1.0F, 22.0F, -1.5F)
        );
        partdefinition.addOrReplaceChild(
                "right_front_leg", CubeListBuilder.create().texOffs(12, 18).addBox(-0.5F, 0.0F, -1.0F, 1.0F, 2.0F, 2.0F, g), PartPose.offset(-1.0F, 22.0F, -1.5F)
        );
        partdefinition.addOrReplaceChild(
                "left_hind_leg", CubeListBuilder.create().texOffs(18, 22).addBox(-0.5F, 0.0F, -1.0F, 1.0F, 2.0F, 2.0F, g), PartPose.offset(1.0F, 22.0F, 2.5F)
        );
        partdefinition.addOrReplaceChild(
                "body", CubeListBuilder.create().texOffs(0, 8).addBox(-2.0F, -1.5F, -3.5F, 4.0F, 3.0F, 7.0F, g), PartPose.offset(0.0F, 20.5F, 0.5F)
        );
        partdefinition.addOrReplaceChild(
                "right_hind_leg", CubeListBuilder.create().texOffs(12, 22).addBox(-0.5F, 0.0F, -1.0F, 1.0F, 2.0F, 2.0F, g), PartPose.offset(-1.0F, 22.0F, 2.5F)
        );
        partdefinition.addOrReplaceChild(
                "tail1",
                CubeListBuilder.create().texOffs(0, 18).addBox(-0.5F, -0.107F, 0.0849F, 1.0F, 1.0F, 5.0F, g),
                PartPose.offsetAndRotation(0.0F, 19.107F, 3.9151F, -0.567232F, 0.0F, 0.0F)
        );
        partdefinition.addOrReplaceChild("tail2", CubeListBuilder.create(), PartPose.ZERO);
        return LayerDefinition.create(meshdefinition, 32, 32);
    }

    @Override
    public void prepareMobModel(@NotNull T entity, float limbSwing, float limbSwingAmount, float partialTick) {
        super.prepareMobModel(entity, limbSwing, limbSwingAmount, partialTick);

        this.body.setPos(0.0F, 20.5F, 0.5F);
        this.body.xRot = 0.0F;

        this.head.setPos(0.0F, 20.0F, -3.125F);
        this.tail1.setPos(0.0F, 19.107F, 3.9151F);
        this.tail2.setPos(0.0F, 0.0F, 0.0F);

        this.leftFrontLeg.setPos(1.0F, 22.0F, -1.5F);
        this.rightFrontLeg.setPos(-1.0F, 22.0F, -1.5F);
        this.leftHindLeg.setPos(1.0F, 22.0F, 2.5F);
        this.rightHindLeg.setPos(-1.0F, 22.0F, 2.5F);

        if (entity.isInSittingPose()) {
            this.body.xRot = -0.43633232F;
            this.body.y += 1.0F;
            this.head.z += 0.75F;
            this.tail1.xRot = -0.0218166F;
            this.tail1.y += 4.0F;
            this.tail1.z -= 0.9F;
            this.leftHindLeg.z -= 0.9F;
            this.rightHindLeg.z -= 0.9F;
        } else {
            this.tail1.xRot = -0.567232F;
        }
    }

    @Override
    public void setupAnim(@NotNull T entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        super.setupAnim(entity, limbSwing, limbSwingAmount, ageInTicks, netHeadYaw, headPitch);

        this.body.xRot = 0.0F;
        if (entity.isInSittingPose()) {
            this.body.xRot = -0.43633232F;
        }

        float lieDownAmount = entity.getLieDownAmount(0.0F);
        float lieDownAmountTail = entity.getLieDownAmountTail(0.0F);

        if (lieDownAmount > 0.0F) {
            this.body.x += 1.0F;
            this.head.xRot = Mth.rotLerp(lieDownAmount, this.head.xRot, (float) (Math.PI / 18));
            this.head.zRot = Mth.rotLerp(lieDownAmount, this.head.zRot, (float) (-Math.PI * 5.0 / 12.0));
            this.head.x += 1.0F;
            this.head.y += 0.75F;
            this.head.z -= 0.5F;
            this.rightFrontLeg.xRot = (float) (-Math.PI / 4);
            this.rightFrontLeg.x += 3.5F;
            this.rightFrontLeg.y -= 0.5F;
            this.leftFrontLeg.xRot = (float) (-Math.PI / 2);
            this.leftFrontLeg.x += 1.0F;
            this.leftFrontLeg.y -= 1.0F;
            this.leftFrontLeg.z -= 2.0F;
            this.rightHindLeg.xRot = (float) (Math.PI * 2.0 / 9.0);
            this.rightHindLeg.yRot = (float) (Math.PI / 9);
            this.rightHindLeg.zRot = (float) (-Math.PI / 9);
            this.rightHindLeg.x += 2.5F;
            this.rightHindLeg.y -= 0.25F;
            this.rightHindLeg.z += 0.5F;
            this.leftHindLeg.x += 1.0F;
            this.leftHindLeg.z -= 1.0F;

            float tailRot = entity.isInSittingPose() ? -0.0218166F : -0.567232F;
            this.tail1.xRot = Mth.rotLerp(lieDownAmountTail, tailRot, tailRot - (float) (Math.PI / 6));
            this.tail1.zRot = Mth.rotLerp(lieDownAmountTail, this.tail1.zRot, (float) (-Math.PI / 18));
            this.tail1.x += 1.0F;
            this.tail1.y += 0.5F;
            this.tail1.z -= 0.25F;
        }
    }
}
