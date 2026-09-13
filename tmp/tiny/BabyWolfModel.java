package com.evandev.tiny_takeover_backport.client.model;

import net.minecraft.client.model.WolfModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.*;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.animal.Wolf;
import org.jetbrains.annotations.NotNull;

public class BabyWolfModel<T extends Wolf> extends WolfModel<T> {
    private final ModelPart babyBody;
    private final ModelPart babyRightHindLeg;
    private final ModelPart babyLeftHindLeg;
    private final ModelPart babyRightFrontLeg;
    private final ModelPart babyLeftFrontLeg;
    private final ModelPart babyTail;

    public BabyWolfModel(ModelPart root) {
        super(root);
        this.babyBody = root.getChild("body");
        this.babyRightHindLeg = root.getChild("right_hind_leg");
        this.babyLeftHindLeg = root.getChild("left_hind_leg");
        this.babyRightFrontLeg = root.getChild("right_front_leg");
        this.babyLeftFrontLeg = root.getChild("left_front_leg");
        this.babyTail = root.getChild("tail");
    }

    public static LayerDefinition createBodyLayer() {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();

        PartDefinition head = root.addOrReplaceChild(
                "head",
                CubeListBuilder.create()
                        .texOffs(0, 12)
                        .addBox(-2.99F, -3.25F, -3.0F, 6.0F, 5.0F, 5.0F, new CubeDeformation(0.025F))
                        .texOffs(17, 12)
                        .addBox(-1.5F, -0.24F, -5.0F, 3.0F, 2.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offset(0.0F, 18.25F, -4.0F)
        );
        head.addOrReplaceChild(
                "right_ear", CubeListBuilder.create().texOffs(0, 5).addBox(-1.0F, -1.0F, -0.5F, 2.0F, 2.0F, 1.0F), PartPose.offset(-2.0F, -4.25F, -0.5F)
        );
        head.addOrReplaceChild(
                "left_ear", CubeListBuilder.create().texOffs(20, 5).addBox(-1.0F, -1.0F, -0.5F, 2.0F, 2.0F, 1.0F), PartPose.offset(2.0F, -4.25F, -0.5F)
        );

        head.addOrReplaceChild("real_head", CubeListBuilder.create(), PartPose.ZERO);
        root.addOrReplaceChild("body", CubeListBuilder.create().texOffs(0, 0).addBox(-3.0F, -2.0F, -4.0F, 6.0F, 4.0F, 8.0F), PartPose.offset(0.0F, 19.0F, 0.0F));
        root.addOrReplaceChild("upper_body", CubeListBuilder.create(), PartPose.ZERO);

        root.addOrReplaceChild(
                "right_hind_leg", CubeListBuilder.create().texOffs(0, 22).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 3.0F, 2.0F), PartPose.offset(-1.5F, 21.0F, 3.0F)
        );
        root.addOrReplaceChild(
                "left_hind_leg", CubeListBuilder.create().texOffs(8, 22).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 3.0F, 2.0F), PartPose.offset(1.5F, 21.0F, 3.0F)
        );
        root.addOrReplaceChild(
                "right_front_leg", CubeListBuilder.create().texOffs(0, 0).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 3.0F, 2.0F), PartPose.offset(-1.5F, 21.0F, -3.0F)
        );
        root.addOrReplaceChild(
                "left_front_leg", CubeListBuilder.create().texOffs(20, 0).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 3.0F, 2.0F), PartPose.offset(1.5F, 21.0F, -3.0F)
        );

        PartDefinition tail = root.addOrReplaceChild("tail", CubeListBuilder.create(), PartPose.offsetAndRotation(0.0F, 19.0F, 3.0F, -0.5236F, 0.0F, 0.0F));
        tail.addOrReplaceChild(
                "tail_r1",
                CubeListBuilder.create().texOffs(22, 16).addBox(-1.0F, -5.7F, -1.0F, 2.0F, 6.0F, 2.0F, new CubeDeformation(0.0F)),
                PartPose.offsetAndRotation(0.0F, -0.6F, 0.2F, -3.1F, 0.0F, 0.0F)
        );

        tail.addOrReplaceChild("real_tail", CubeListBuilder.create(), PartPose.ZERO);

        return LayerDefinition.create(mesh, 32, 32);
    }

    @Override
    public void prepareMobModel(@NotNull T entity, float limbSwing, float limbSwingAmount, float partialTick) {
        super.prepareMobModel(entity, limbSwing, limbSwingAmount, partialTick);

        if (entity.isAngry()) {
            this.babyTail.yRot = 0.0F;
        } else {
            this.babyTail.yRot = Mth.cos(limbSwing * 0.6662F) * 1.4F * limbSwingAmount;
        }

        if (entity.isInSittingPose()) {
            this.babyBody.setPos(0.0F, 21.0F, -1.0F);
            this.babyBody.xRot = (float) Math.PI / 4F - 1.0F;

            this.babyTail.setPos(0.0F, 23.5F, 2.0F);

            this.babyRightHindLeg.setPos(-1.5F, 24.35F, 0.5F);
            this.babyRightHindLeg.xRot = (float) Math.PI * 1.5F;
            this.babyLeftHindLeg.setPos(1.5F, 24.35F, 0.5F);
            this.babyLeftHindLeg.xRot = (float) Math.PI * 1.5F;

            this.babyRightFrontLeg.xRot = 5.811947F;
            this.babyRightFrontLeg.setPos(-1.495F, 21.5F, -3.0F);
            this.babyLeftFrontLeg.xRot = 5.811947F;
            this.babyLeftFrontLeg.setPos(1.495F, 21.5F, -3.0F);
        } else {
            this.babyBody.setPos(0.0F, 19.0F, 0.0F);
            this.babyBody.xRot = 0.0F;

            this.babyTail.setPos(0.0F, 19.0F, 3.0F);

            this.babyRightHindLeg.setPos(-1.5F, 21.0F, 3.0F);
            this.babyLeftHindLeg.setPos(1.5F, 21.0F, 3.0F);
            this.babyRightFrontLeg.setPos(-1.5F, 21.0F, -3.0F);
            this.babyLeftFrontLeg.setPos(1.5F, 21.0F, -3.0F);

            this.babyRightHindLeg.xRot = Mth.cos(limbSwing * 0.6662F) * 1.4F * limbSwingAmount;
            this.babyLeftHindLeg.xRot = Mth.cos(limbSwing * 0.6662F + (float) Math.PI) * 1.4F * limbSwingAmount;
            this.babyRightFrontLeg.xRot = Mth.cos(limbSwing * 0.6662F + (float) Math.PI) * 1.4F * limbSwingAmount;
            this.babyLeftFrontLeg.xRot = Mth.cos(limbSwing * 0.6662F) * 1.4F * limbSwingAmount;
        }
    }
}