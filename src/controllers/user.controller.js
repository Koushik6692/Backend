import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - not empty
  // check if user already exists: username, email
  // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { username, fullName, password, email } = req.body;
  if (
    [username, fullName, password, email].some((field) => field.trim() == "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const userExist = await User.findOne({ $or: [{ username }, { email }] });
  if (userExist) {
    throw new ApiError(409, "Username or email already exist");
  }
  const avatarLocalFilePath = req.files?.avatar[0].path;
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalFilePath) {
    throw new ApiError(400, "Avatar file is required!!");
  }

  const avatar = await uploadOnCloudinary(avatarLocalFilePath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar)
    throw new ApiError(500, "Avatar file couldn't upload to cloudinary!!");

  const user = await User.create({
    username: username.toLowerCase(),
    fullName,
    email,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    password,
  });
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser)
    throw new ApiError(500, "Error While Creating user in db!!");
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User created successfully"));
});
const genrateAcsessAndRefreshToken = asyncHandler(async (user_id) => {
  try {
    const user = await User.findById(user_id);
    const accessToken = await user.genrateAccessToken();
    const refreshToken = await user.genrateRefreshToken();

    user.refreshToken = refreshToken;
    try {
      await user.save({ validateBeforeSave: false });
      console.log("Refresh token saved successfully");
    } catch (error) {
      console.error("Error saving user:", error);
    }

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while genrating access and refresh Token"
    );
  }
});

const loginUser = asyncHandler(async (req, res) => {
  //get data from frontend
  //verify username,email exists in db
  //get user
  //verify password
  //set cookies
  //update cookies in db
  const { username, email, password } = req.body;

  if (!username && !email) {
    throw new ApiError(401, "Username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) {
    throw new ApiError(401, "User not found");
  }
  // console.log(user);
  const verifyPassword = await user.isPasswordCorrect(password);
  if (!verifyPassword) {
    throw new ApiError(401, "Invalid user credintials");
  }
  const { accessToken, refreshToken } = await genrateAcsessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        201,
        { user: loggedInUser, accessToken, refreshToken },
        "User loggedIn Successfully!"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // using auth middleware user is added to req in user.route.js
  //find the user in db and delete the refreshtoken in db
  //delete cookies

  // const loggedInUser = await User.findById(req.user._id);
  // loggedInUser.refreshToken = undefined;

  // await loggedInUser.save({ validateBeforeSave: false });

  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: "",
      },
    },
    {
      new: true,
    }
  );

  res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(200, "User loggedOut Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  //get refresh token from req.cookie  or req.body
  // find the user in db and get the refreshToken from db
  // if the refreshToken is valid then generate new accessToken and refreshToken
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) throw new ApiError(401, "unauthorized request");

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) throw new ApiError(401, "Invalid Refresh Token");

    if (incomingRefreshToken != user?.refreshAccessToken)
      throw new ApiError(401, "Refresh Token Expired or Used!");

    const { accessToken, refreshToken } = await genrateAcsessAndRefreshToken(
      user._id
    );

    const options = {
      httpOnly: true,
      secure: true,
    };

    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access Token refreshed Successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, "something went wrong while refreshing token");
  }
});

const upDatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");
  const isValidPassword = user.isPasswordCorrect(oldPassword);
  if (!isValidPassword) throw new ApiError(401, "Invalid Old Password");
  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password updated successfully!"));
});

const updateUserDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) throw new ApiError(401, "All fields are required!");
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password - refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Details updated successFully!"));
});

const updateAvatar = asyncHandler(async (req, res) => {
  const avatarLocalFilePath = req?.file.path;
  if (!avatarLocalFilePath) throw new ApiError(401, "Avatar file is missing!");

  const avatar = uploadOnCloudinary(avatarLocalFilePath);
  if (!avatar.url)
    throw new ApiError(
      401,
      "Something went wrong while uploading to cloudinary!"
    );
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully!"));
});

const updateCoverImage = asyncHandler(async (req, res) => {
  const coverImageFilePath = req?.file.path;
  if (!coverImageFilePath) throw new ApiError(401, "Avatar file is missing!");

  const coverImage = uploadOnCloudinary(coverImageFilePath);
  if (!coverImage.url)
    throw new ApiError(
      401,
      "Something went wrong while uploading to cloudinary!"
    );
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "CoverImage updated successfully!"));
});

const getCurrentUserDetails = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User details fetched successfully!"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const username = req.params;
  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: "subscriptions",
        loacalField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribedToCount: { $size: "$subscribedTo" },
        subscribersCout: { $size: "$subscribers" },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  upDatePassword,
  updateAvatar,
  updateCoverImage,
  updateUserDetails,
  getUserChannelProfile,
  getCurrentUserDetails,
};
