package com.evandev.tiny_takeover_backport.client.model;

import net.minecraft.client.model.SheepModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.*;
import net.minecraft.world.entity.animal.Sheep;
import org.jetbrains.annotations.NotNull;

public class BabySheepModel extends SheepModel {

    private static final float BABY_HEAD_Y = 15.5F;

    public BabySheepModel(ModelPart root) {
        super(root);
    }

    public static LayerDefinition createBodyLayer() {
        return createBodyLayer(new CubeDeformation(0.0F));
    }

    public static LayerDefinition createBodyLayer(CubeDeformation deformation) {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
        root.addOrReplaceChild(
                "body", CubeListBuilder.create().texOffs(0, 10).addBox(-3.0F, -2.0F, -4.5F, 6.0F, 4.0F, 9.0F, deformation), PartPose.offset(0.0F, 17.0F, 0.5F)
        );
        root.addOrReplaceChild(
                "head", CubeListBuilder.create().texOffs(0, 0).addBox(-2.5F, -4.5F, -3.5F, 5.0F, 5.0F, 5.0F, deformation), PartPose.offset(0.0F, BABY_HEAD_Y, -2.5F)
        );
        root.addOrReplaceChild(
                "right_hind_leg", CubeListBuilder.create().texOffs(0, 23).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 5.0F, 2.0F, deformation), PartPose.offset(-2.0F, 19.0F, 3.0F)
        );
        root.addOrReplaceChild(
                "left_hind_leg", CubeListBuilder.create().texOffs(24, 12).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 5.0F, 2.0F, deformation), PartPose.offset(2.0F, 19.0F, 3.0F)
        );
        root.addOrReplaceChild(
                "right_front_leg", CubeListBuilder.create().texOffs(8, 23).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 5.0F, 2.0F, deformation), PartPose.offset(-2.0F, 19.0F, -2.0F)
        );
        root.addOrReplaceChild(
                "left_front_leg", CubeListBuilder.create().texOffs(24, 5).addBox(-1.0F, 0.0F, -1.0F, 2.0F, 5.0F, 2.0F, deformation), PartPose.offset(2.0F, 19.0F, -2.0F)
        );
        return LayerDefinition.create(mesh, 64, 32);
    }

    @Override
    public void prepareMobModel(@NotNull Sheep entity, float limbSwing, float limbSwingAmount, float partialTick) {
        super.prepareMobModel(entity, limbSwing, limbSwingAmount, partialTick);
        this.head.y = BABY_HEAD_Y + entity.getHeadEatPositionScale(partialTick) * 2.0F;
    }
}
